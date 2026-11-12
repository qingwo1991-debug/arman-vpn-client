package service

// This extension reuses the daemon's single native account pool. It never
// constructs a Controller, selects a global server, or dials a data tunnel.
import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"sync"
	"time"

	"github.com/armanlife/arman-vpn-client/core/internal/accounts"
	"github.com/armanlife/arman-vpn-client/core/internal/guardian"
)

const regionalRefreshLead = 2 * time.Minute
const regionalRetryDelay = 30 * time.Second

type regionalLeaseState struct {
	mu            sync.Mutex
	epoch         string
	account       string
	token         string
	deadline      time.Time // monotonic deadline anchored once to native ExpiresAt
	retryAt       time.Time
	flight        chan struct{}
	flightCancel  context.CancelFunc
	lastTokenHash [32]byte
	lastDeadline  time.Time
}

type regionalResponse struct {
	Allowed          bool   `json:"allowed"`
	Epoch            string `json:"epoch,omitempty"`
	Token            string `json:"token,omitempty"`
	RemainingSeconds int64  `json:"remainingSeconds,omitempty"`
	Reason           string `json:"reason,omitempty"`
}

func (r *regionalLeaseState) invalidate() {
	r.mu.Lock()
	// This context belongs only to the regional flight: cancellation must
	// never interrupt an unrelated native operation already using the pool.
	if r.flightCancel != nil {
		r.flightCancel()
	}
	r.epoch, r.account, r.token = "", "", ""
	r.deadline, r.retryAt = time.Time{}, time.Time{}
	r.mu.Unlock()
}

func (r *regionalLeaseState) bind(id string) bool {
	if r.account == id && r.epoch != "" {
		return true
	}
	var b [24]byte
	if _, err := rand.Read(b[:]); err != nil {
		return false
	}
	if r.flightCancel != nil {
		r.flightCancel()
	}
	r.account, r.epoch, r.token = id, hex.EncodeToString(b[:]), ""
	r.deadline, r.retryAt = time.Time{}, time.Time{}
	return true
}

func (d *Daemon) regionalCandidate(e *proxyEngine) (accounts.Account, bool) {
	d.mu.Lock()
	allowed := !d.off && d.engine == e
	d.mu.Unlock()
	if !allowed {
		return accounts.Account{}, false
	}
	e.idle.mu.Lock()
	stopped := e.idle.stopped
	e.idle.mu.Unlock()
	if stopped {
		return accounts.Account{}, false
	}
	acc, err := d.mgr.Candidate(nil)
	return acc, err == nil
}

func (d *Daemon) regionalHTTP(e *proxyEngine, req *http.Request) ([]byte, int) {
	answer := func(status int, value regionalResponse) ([]byte, int) { b, _ := json.Marshal(value); return b, status }
	deny := func(status int, reason string) ([]byte, int) { return answer(status, regionalResponse{Reason: reason}) }
	r := &e.regional
	for {
		acc, ok := d.regionalCandidate(e)
		if !ok {
			r.invalidate()
			return deny(http.StatusForbidden, "not_allowed")
		}
		r.mu.Lock()
		// Recheck after taking the cache lock; an off/account mutation may
		// have invalidated the first eligibility snapshot while we waited.
		acc, ok = d.regionalCandidate(e)
		if !ok {
			r.mu.Unlock()
			r.invalidate()
			return deny(http.StatusForbidden, "not_allowed")
		}
		if !r.bind(acc.ID) {
			r.mu.Unlock()
			return deny(http.StatusServiceUnavailable, "unavailable")
		}
		if req.Method == http.MethodGet {
			epoch := r.epoch
			r.mu.Unlock()
			return answer(http.StatusOK, regionalResponse{Allowed: true, Epoch: epoch})
		}
		now := time.Now()
		if r.token != "" && (time.Until(r.deadline) > regionalRefreshLead || (now.Before(r.retryAt) && time.Until(r.deadline) > 5*time.Second)) {
			response := regionalResponse{Allowed: true, Epoch: r.epoch, Token: r.token, RemainingSeconds: int64(time.Until(r.deadline) / time.Second)}
			r.mu.Unlock()
			return answer(http.StatusOK, response)
		}
		if now.Before(r.retryAt) {
			r.mu.Unlock()
			return deny(http.StatusServiceUnavailable, "retry_later")
		}
		if flight := r.flight; flight != nil {
			r.mu.Unlock()
			select {
			case <-flight:
				continue
			case <-req.Context().Done():
				return deny(http.StatusServiceUnavailable, "unavailable")
			}
		}
		flight := make(chan struct{})
		flightCtx, cancelFlight := context.WithCancel(req.Context())
		r.flight, r.flightCancel = flight, cancelFlight
		beforeEpoch := r.epoch
		r.mu.Unlock()

		auth, pass, err := d.pool.AcquirePass(flightCtx, e.cfg.Network.GuardianEndpoint)
		cancelFlight()
		r.mu.Lock()
		after, allowed := d.regionalCandidate(e)
		// An off/account operation invalidates the epoch even if it returned to
		// the same account before this slow Guardian operation finished.
		invalidated := r.epoch != beforeEpoch
		if !allowed || invalidated {
			// Invalidation already cleared the old lease. Do not mutate a new
			// epoch or impose a retry penalty after a prompt OFF/ON cycle.
			r.flight, r.flightCancel = nil, nil
			close(flight)
			r.mu.Unlock()
			return deny(http.StatusForbidden, "not_allowed")
		} else if err == nil && (auth == nil || auth.AccountID() != after.ID) {
			err = guardian.ErrTokenInvalid
		}
		if err == nil && (pass == nil || pass.RawToken == "" || len(pass.RawToken) > 32768) {
			err = guardian.ErrTokenInvalid
		}
		remaining := time.Duration(0)
		if err == nil {
			remaining = time.Until(pass.ExpiresAt())
			if remaining <= 5*time.Second || remaining > time.Hour {
				err = guardian.ErrTokenInvalid
			}
		}
		if err == nil && !r.bind(after.ID) {
			err = guardian.ErrTokenInvalid
		}
		if err == nil {
			// Hash and original monotonic deadline survive invalidation: receiving
			// the same JWT can never extend it by re-anchoring corrected claims.
			hash := sha256.Sum256([]byte(pass.RawToken))
			if hash != r.lastTokenHash {
				r.lastTokenHash, r.lastDeadline = hash, time.Now().Add(remaining)
			}
			if time.Until(r.lastDeadline) <= 5*time.Second {
				err = guardian.ErrTokenInvalid
			} else {
				r.token, r.deadline = pass.RawToken, r.lastDeadline
			}
		}
		if err != nil {
			// Only a transient control-plane failure may retain a still-valid
			// pass of the same account. A rejection invalidates its binding.
			if !allowed || invalidated || !guardian.IsTransient(err) || r.account != after.ID || time.Until(r.deadline) <= 5*time.Second {
				r.token = ""
			}
			if errors.Is(err, guardian.ErrTokenInvalid) || errors.Is(err, guardian.ErrQuotaExceeded) || errors.Is(err, guardian.ErrRegionUnavailable) {
				r.epoch, r.account, r.token = "", "", ""
				// Rotate the opaque binding now so the next status poll cannot
				// re-bind and accidentally clear the rejection retry delay.
				if allowed && after.ID != "" {
					r.bind(after.ID)
				}
				invalidated = true
			}
		}
		r.retryAt = time.Now().Add(regionalRetryDelay)
		r.flight, r.flightCancel = nil, nil
		close(flight)
		if !allowed || invalidated {
			r.mu.Unlock()
			return deny(http.StatusForbidden, "not_allowed")
		}
		if err != nil {
			r.mu.Unlock()
			return deny(http.StatusServiceUnavailable, "unavailable")
		}
		response := regionalResponse{Allowed: true, Epoch: r.epoch, Token: r.token, RemainingSeconds: int64(time.Until(r.deadline) / time.Second)}
		r.mu.Unlock()
		return answer(http.StatusOK, response)
	}
}
