package service

import (
	"bufio"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/armanlife/arman-vpn-client/core/internal/accounts"
)

func regionalFixture(t *testing.T) (*Daemon, *proxyEngine, string, *atomic.Int32, *atomic.Int32) {
	t.Helper()
	d := newTestDaemon(t)
	id := addTestAccount(t, d, "fixture")
	d.cfg.Proxy.Username = "fixture-user"
	d.cfg.Proxy.Password = "fixture-pass"
	var passes, mode atomic.Int32
	issuedAt := time.Now()
	setCoreControlPlane(t, func(r *http.Request) (*http.Response, error) {
		if r.Method != http.MethodGet || !strings.HasSuffix(r.URL.Path, "/api/v1/fpn/token") {
			t.Errorf("not a pass-only request: %s %s", r.Method, r.URL)
			return nil, fmt.Errorf("unexpected fixture endpoint")
		}
		passes.Add(1)
		if mode.Load() == 1 {
			return coreResponse(r, 400, `{"error":"fixture"}`, nil), nil
		}
		used := int64(1)
		if mode.Load() == 2 {
			used = 50
		}
		now := issuedAt
		claims := fmt.Sprintf(`{"iat":%d,"nbf":%d,"exp":%d}`, now.Unix(), now.Unix(), now.Add(10*time.Minute).Unix())
		token := "e30." + base64.RawURLEncoding.EncodeToString([]byte(claims)) + ".fixture"
		return coreResponse(r, 200, `{"token":"`+token+`"}`, quotaHeader(used)), nil
	})
	e, err := d.startEngine()
	if err != nil {
		t.Fatal(err)
	}
	d.mu.Lock()
	d.engine = e
	d.mu.Unlock()
	t.Cleanup(e.stop)
	return d, e, id, &passes, &mode
}

func regionCall(t *testing.T, d *Daemon, e *proxyEngine, method string) (regionalResponse, int) {
	t.Helper()
	req := httptest.NewRequest(method, "http://firefox-regions.internal/v1/lease", strings.NewReader("{}"))
	b, status := d.regionalHTTP(e, req)
	var r regionalResponse
	if err := json.Unmarshal(b, &r); err != nil {
		t.Fatal(err)
	}
	return r, status
}

func TestRegionalLeaseNoGlobalWakeCacheAndPower(t *testing.T) {
	d, e, id, passes, _ := regionalFixture(t)
	status, code := regionCall(t, d, e, http.MethodGet)
	if code != 200 || !status.Allowed || status.Token != "" || status.Epoch == "" || passes.Load() != 0 {
		t.Fatalf("initial status %+v code=%d", status, code)
	}
	const n = 12
	var wg sync.WaitGroup
	responses := make(chan regionalResponse, n)
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			r, c := regionCall(t, d, e, http.MethodPost)
			if c != 200 {
				t.Errorf("lease status=%d", c)
			}
			responses <- r
		}()
	}
	wg.Wait()
	close(responses)
	for r := range responses {
		if !r.Allowed || r.Token == "" || r.Epoch != status.Epoch || r.RemainingSeconds < 5 || r.RemainingSeconds > 600 {
			t.Fatalf("lease %+v", r)
		}
	}
	if passes.Load() != 1 || e.currentController() != nil || e.asleepSince().IsZero() {
		t.Fatalf("passes=%d global wake=%v", passes.Load(), e.currentController() != nil)
	}
	// The actual mixed listener authenticates without dashboard/admin tokens.
	conn, err := net.Dial("tcp", e.listener.Addr().String())
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	conn.SetDeadline(time.Now().Add(5 * time.Second))
	auth := base64.StdEncoding.EncodeToString([]byte("fixture-user:fixture-pass"))
	fmt.Fprintf(conn, "GET http://firefox-regions.internal/v1/status HTTP/1.1\r\nHost: firefox-regions.internal\r\nProxy-Authorization: Basic %s\r\n\r\n", auth)
	resp, err := http.ReadResponse(bufio.NewReader(conn), nil)
	if err != nil {
		t.Fatal(err)
	}
	body, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	if resp.StatusCode != 200 || strings.Contains(string(body), "token") {
		t.Fatalf("listener response %d %s", resp.StatusCode, body)
	}
	d.SetOn(false)
	denied, c := regionCall(t, d, e, http.MethodGet)
	if c != 403 || denied.Allowed {
		t.Fatal("power off admitted")
	}
	d.SetOn(true)
	again, c := regionCall(t, d, e, http.MethodGet)
	if c != 200 || again.Epoch == status.Epoch {
		t.Fatal("power cycle retained epoch")
	}
	if err := d.setAccountEnabled(id, false); err != nil {
		t.Fatal(err)
	}
	denied, c = regionCall(t, d, e, http.MethodGet)
	if c != 403 || denied.Allowed {
		t.Fatal("all disabled admitted")
	}
}

func TestRegionalLeaseExpiryFailureBackoffAndQuota(t *testing.T) {
	d, e, id, passes, mode := regionalFixture(t)
	first, c := regionCall(t, d, e, http.MethodPost)
	if c != 200 {
		t.Fatal(c)
	}
	e.regional.mu.Lock()
	e.regional.deadline = time.Now().Add(-time.Second)
	e.regional.retryAt = time.Time{}
	e.regional.mu.Unlock()
	mode.Store(1)
	fail, c := regionCall(t, d, e, http.MethodPost)
	if c != 503 || fail.Allowed || fail.Token != "" {
		t.Fatal("failed refresh admitted")
	}
	before := passes.Load()
	_, c = regionCall(t, d, e, http.MethodPost)
	if c != 503 || passes.Load() != before {
		t.Fatal("retry backoff ignored")
	}
	e.regional.mu.Lock()
	e.regional.retryAt = time.Time{}
	e.regional.mu.Unlock()
	mode.Store(2)
	_, c = regionCall(t, d, e, http.MethodPost)
	if c == 200 {
		t.Fatal("exhausted quota admitted")
	}
	accs := d.mgr.Accounts()
	if len(accs) != 1 || accs[0].ID != id || accs[0].Status != accounts.StatusReserved {
		t.Fatalf("quota state %+v", accs)
	}
	denied, c := regionCall(t, d, e, http.MethodGet)
	if c != 403 || denied.Allowed || denied.Epoch == first.Epoch {
		t.Fatal("spent account admitted")
	}
}

func TestRegionalLeaseContextAndAccountEpoch(t *testing.T) {
	d, e, id, _, _ := regionalFixture(t)
	one, c := regionCall(t, d, e, http.MethodGet)
	if c != 200 {
		t.Fatal(c)
	}
	second := addTestAccount(t, d, "other")
	if err := d.activateAccount(second); err != nil {
		t.Fatal(err)
	}
	two, c := regionCall(t, d, e, http.MethodGet)
	if c != 200 || one.Epoch == two.Epoch || strings.Contains(two.Epoch, id) || strings.Contains(two.Epoch, second) {
		t.Fatal("account epoch not opaque/new")
	}
	// A request waiting behind a native issuer operation remains cancellable.
	e.regional.mu.Lock()
	e.regional.flight = make(chan struct{})
	e.regional.mu.Unlock()
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	req := httptest.NewRequest(http.MethodPost, "http://firefox-regions.internal/v1/lease", nil).WithContext(ctx)
	b, c := d.regionalHTTP(e, req)
	if c != 503 || strings.Contains(string(b), "token") {
		t.Fatal("cancelled request admitted")
	}
}

func TestRegionalLeaseAccountDisableDuringFetch(t *testing.T) {
	d, e, id, _, _ := regionalFixture(t)
	started, release := make(chan struct{}), make(chan struct{})
	setCoreControlPlane(t, func(r *http.Request) (*http.Response, error) {
		close(started)
		<-release
		now := time.Now()
		claims := fmt.Sprintf(`{"iat":%d,"exp":%d}`, now.Unix(), now.Add(10*time.Minute).Unix())
		token := "e30." + base64.RawURLEncoding.EncodeToString([]byte(claims)) + ".fixture"
		return coreResponse(r, 200, `{"token":"`+token+`"}`, quotaHeader(1)), nil
	})
	result := make(chan int, 1)
	go func() { _, c := regionCall(t, d, e, http.MethodPost); result <- c }()
	<-started
	if err := d.setAccountEnabled(id, false); err != nil {
		t.Fatal(err)
	}
	close(release)
	if c := <-result; c == 200 {
		t.Fatal("disabled during issue admitted")
	}
}

// Wait until the request owns a flight, but not necessarily the shared issuer.
func waitRegionalFlight(t *testing.T, e *proxyEngine) {
	t.Helper()
	deadline := time.NewTimer(5 * time.Second)
	defer deadline.Stop()
	tick := time.NewTicker(time.Millisecond)
	defer tick.Stop()
	for {
		e.regional.mu.Lock()
		ready := e.regional.flight != nil && e.regional.flightCancel != nil
		e.regional.mu.Unlock()
		if ready {
			return
		}
		select {
		case <-tick.C:
		case <-deadline.C:
			t.Fatal("regional flight did not start")
		}
	}
}

func TestRegionalOffCancelsQueuedIssuerAndReenableSingleflight(t *testing.T) {
	d, e, _, _, _ := regionalFixture(t)
	nativeStarted, releaseNative := make(chan context.Context, 1), make(chan struct{})
	var releaseOnce sync.Once
	release := func() { releaseOnce.Do(func() { close(releaseNative) }) }
	defer release()
	var passCalls atomic.Int32
	now := time.Now()
	claims := fmt.Sprintf(`{"iat":%d,"exp":%d}`, now.Unix(), now.Add(10*time.Minute).Unix())
	token := "e30." + base64.RawURLEncoding.EncodeToString([]byte(claims)) + ".fixture"
	setCoreControlPlane(t, func(r *http.Request) (*http.Response, error) {
		if r.Method == http.MethodHead {
			nativeStarted <- r.Context()
			select {
			case <-releaseNative:
				return coreResponse(r, 200, "", quotaHeader(1)), nil
			case <-r.Context().Done():
				return nil, r.Context().Err()
			}
		}
		passCalls.Add(1)
		return coreResponse(r, 200, `{"token":"`+token+`"}`, quotaHeader(1)), nil
	})
	nativeDone := make(chan error, 1)
	go func() {
		_, err := d.pool.FetchUsage(context.Background(), e.cfg.Network.GuardianEndpoint, d.mgr.Accounts()[0], false)
		nativeDone <- err
	}()
	var nativeCtx context.Context
	select {
	case nativeCtx = <-nativeStarted:
	case <-time.After(5 * time.Second):
		t.Fatal("native issuer did not start")
	}
	denied := make(chan int, 1)
	go func() { _, c := regionCall(t, d, e, http.MethodPost); denied <- c }()
	waitRegionalFlight(t, e)
	d.SetOn(false)
	select {
	case c := <-denied:
		if c != 403 {
			t.Fatalf("queued status=%d", c)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("queued request not cancelled")
	}
	if passCalls.Load() != 0 {
		t.Fatal("queued regional request started network after OFF")
	}
	if nativeCtx.Err() != nil {
		t.Fatal("OFF cancelled unrelated native issuer")
	}
	d.SetOn(true)
	const n = 8
	results := make(chan int, n)
	for i := 0; i < n; i++ {
		go func() { _, c := regionCall(t, d, e, http.MethodPost); results <- c }()
	}
	waitRegionalFlight(t, e)
	release()
	if err := <-nativeDone; err != nil {
		t.Fatal(err)
	}
	for i := 0; i < n; i++ {
		select {
		case c := <-results:
			if c != 200 {
				t.Fatalf("reenable status=%d", c)
			}
		case <-time.After(5 * time.Second):
			t.Fatal("reenable singleflight stuck")
		}
	}
	if passCalls.Load() != 1 || e.currentController() != nil {
		t.Fatal("reenable was not one no-global pass")
	}
}

func TestRegionalInvalidationCancelsInflightContext(t *testing.T) {
	for _, operation := range []string{"off", "stop", "disable"} {
		t.Run(operation, func(t *testing.T) {
			d, e, id, _, _ := regionalFixture(t)
			started, cancelled := make(chan struct{}), make(chan struct{})
			var calls atomic.Int32
			now := time.Now()
			claims := fmt.Sprintf(`{"iat":%d,"exp":%d}`, now.Unix(), now.Add(10*time.Minute).Unix())
			token := "e30." + base64.RawURLEncoding.EncodeToString([]byte(claims)) + ".fixture"
			setCoreControlPlane(t, func(r *http.Request) (*http.Response, error) {
				if calls.Add(1) == 1 {
					close(started)
					<-r.Context().Done()
					close(cancelled)
					return nil, r.Context().Err()
				}
				return coreResponse(r, 200, `{"token":"`+token+`"}`, quotaHeader(1)), nil
			})
			done := make(chan int, 1)
			go func() { _, c := regionCall(t, d, e, http.MethodPost); done <- c }()
			select {
			case <-started:
			case <-time.After(5 * time.Second):
				t.Fatal("flight did not start")
			}
			switch operation {
			case "off":
				d.SetOn(false)
			case "stop":
				e.stop()
			case "disable":
				if err := d.setAccountEnabled(id, false); err != nil {
					t.Fatal(err)
				}
			}
			select {
			case <-cancelled:
			case <-time.After(5 * time.Second):
				t.Fatal("inflight transport context not cancelled")
			}
			select {
			case c := <-done:
				if c != 403 {
					t.Fatalf("cancelled result=%d", c)
				}
			case <-time.After(5 * time.Second):
				t.Fatal("cancelled flight stuck")
			}
			if operation == "off" {
				d.SetOn(true)
				if _, c := regionCall(t, d, e, http.MethodPost); c != 200 {
					t.Fatalf("reenable=%d", c)
				}
			}
		})
	}
}

func TestRegionalNativeCandidatePolicyAndSameJWTDeadline(t *testing.T) {
	d, e, id, _, _ := regionalFixture(t)
	// Future reservation and sign-in-required state must fail closed; a due
	// unavailable retry is a native candidate, not a blanket status==ready rule.
	if err := d.mgr.MarkReauthRequired(id, accounts.Why{Code: accounts.ReasonSignInRequired}); err != nil {
		t.Fatal(err)
	}
	if _, c := regionCall(t, d, e, http.MethodGet); c != 403 {
		t.Fatal("reauth admitted")
	}
	if err := d.mgr.MarkUnavailable(id, accounts.Why{Code: accounts.ReasonNotEntitled}, time.Now().Add(time.Hour)); err != nil {
		t.Fatal(err)
	}
	if _, c := regionCall(t, d, e, http.MethodGet); c != 403 {
		t.Fatal("future unavailable admitted")
	}
	if err := d.mgr.MarkUnavailable(id, accounts.Why{Code: accounts.ReasonNotEntitled}, time.Now().Add(-time.Second)); err != nil {
		t.Fatal(err)
	}
	if _, c := regionCall(t, d, e, http.MethodGet); c != 200 {
		t.Fatal("due native candidate rejected")
	}
	// AcquirePass marks the accepted candidate ready without manual activation.
	lease, c := regionCall(t, d, e, http.MethodPost)
	if c != 200 {
		t.Fatal(c)
	}
	e.regional.mu.Lock()
	deadline := time.Now().Add(90 * time.Second)
	e.regional.deadline = deadline
	e.regional.lastDeadline = deadline
	e.regional.retryAt = time.Time{}
	e.regional.mu.Unlock()
	e.regional.invalidate()
	again, c := regionCall(t, d, e, http.MethodPost)
	if c != 200 || again.Token != lease.Token || again.RemainingSeconds > 90 {
		t.Fatalf("identical JWT extended: %+v code%d", again, c)
	}
	if e.currentController() != nil {
		t.Fatal("policy path woke global controller")
	}
}
