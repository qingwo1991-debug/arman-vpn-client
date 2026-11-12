package proxy

import (
	"context"
	"errors"
	"fmt"
	"github.com/armanlife/arman-vpn-client/core/internal/accounts"
	"github.com/armanlife/arman-vpn-client/core/internal/fxa"
	"net/http"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestNativeIssuerSerializesAllPassCallers(t *testing.T) {
	pool, accs := newTestAccountPool(t, "a")
	var active, max atomic.Int32
	setCoreControlPlane(t, func(r *http.Request) (*http.Response, error) {
		n := active.Add(1)
		for old := max.Load(); n > old && !max.CompareAndSwap(old, n); old = max.Load() {
		}
		defer active.Add(-1)
		if r.URL.Path != "/api/v1/fpn/token" {
			return nil, fmt.Errorf("unexpected fixture endpoint")
		}
		time.Sleep(time.Millisecond)
		return coreResponse(r, 200, `{"token":"`+accountJWT("a")+`"}`, quotaHeader(1)), nil
	})
	var wg sync.WaitGroup
	for i := 0; i < 12; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			var err error
			if i%2 == 0 {
				_, _, err = pool.AcquirePass(context.Background(), "https://guardian.invalid")
			} else {
				_, err = pool.FetchUsage(context.Background(), "https://guardian.invalid", accs["a"], false)
			}
			if err != nil {
				t.Error(err)
			}
		}(i)
	}
	wg.Wait()
	if max.Load() != 1 {
		t.Fatalf("simultaneous issuer operations=%d", max.Load())
	}
	if err := pool.lockIssuer(context.Background()); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, _, err := pool.AcquirePass(ctx, "https://guardian.invalid"); err == nil {
		t.Fatal("cancelled acquire blocked or succeeded")
	}
	pool.unlockIssuer()
}

func TestNativeQuotaObservationUsesHeadAuthNotRegionalActive(t *testing.T) {
	pool, accs := newTestAccountPool(t, "a", "b", "c")
	if err := pool.mgr.Activate(accs["a"].ID); err != nil {
		t.Fatal(err)
	}
	authA, err := pool.AuthFor(accs["a"])
	if err != nil {
		t.Fatal(err)
	}
	// Simulate a completed regional pass having already selected B.
	if err := pool.mgr.Activate(accs["b"].ID); err != nil {
		t.Fatal(err)
	}
	var gets atomic.Int32
	setCoreControlPlane(t, func(r *http.Request) (*http.Response, error) {
		if r.Method != http.MethodHead || accountFromBearer(r) != "a" {
			gets.Add(1)
			return nil, fmt.Errorf("unexpected handover request")
		}
		return coreResponse(r, 200, "", quotaHeader(46)), nil
	})
	controller := &Controller{guardian: "https://guardian.invalid", accounts: pool, auth: authA, quotaCheckNow: make(chan struct{}, 1), done: make(chan struct{})}
	controller.checkQuota()
	a, b, c := accountStatus(t, pool, accs["a"].ID), accountStatus(t, pool, accs["b"].ID), accountStatus(t, pool, accs["c"].ID)
	if a.Usage == nil || a.Usage.RemainingBytes != 4*testGiB || a.Status != accounts.StatusReserved {
		t.Fatalf("A usage=%+v", a)
	}
	if b.Usage != nil || b.Status != accounts.StatusReady || c.Usage != nil || c.Status != accounts.StatusReady {
		t.Fatal("A quota corrupted unrelated B/C")
	}
	if active, _ := pool.mgr.Active(); active.ID != accs["b"].ID || gets.Load() != 0 {
		t.Fatal("stale quota check handed over unrelated active B")
	}
}

// ctx.Err is checked again after acquiring the semaphore. This deliberately
// changes Err between the entry check and the send, without timing races.
type cancelledOnAcquireContext struct {
	context.Context
	calls atomic.Int32
}

func (c *cancelledOnAcquireContext) Err() error {
	if c.calls.Add(1) > 1 {
		return context.Canceled
	}
	return nil
}
func TestNativeIssuerRechecksContextAfterAcquiring(t *testing.T) {
	pool, _ := newTestAccountPool(t, "a")
	ctx := &cancelledOnAcquireContext{Context: context.Background()}
	if err := pool.lockIssuer(ctx); !errors.Is(err, context.Canceled) {
		t.Fatalf("error=%v", err)
	}
	if err := pool.lockIssuer(context.Background()); err != nil {
		t.Fatal(err)
	}
	pool.unlockIssuer()
}

func TestNativeCredentialCommitAndRemovalShareIssuer(t *testing.T) {
	pool, accs := newTestAccountPool(t, "a")
	if err := pool.lockIssuer(context.Background()); err != nil {
		t.Fatal(err)
	}
	auth, err := pool.AuthFor(accs["a"])
	if err != nil {
		t.Fatal(err)
	}
	installDone := make(chan error, 1)
	go func() {
		_, _, err := pool.InstallCredentials(context.Background(), "a@example.com", "", &fxa.SavedTokens{AccessToken: "new-access", RefreshToken: "new-refresh", ObtainedAt: time.Now(), ExpiresIn: 3600}, time.Now())
		installDone <- err
	}()
	// This represents the old in-flight rotating-token persist. The completed
	// sign-in must commit after it, then forget this cached stale auth.
	auth.Token.AccessToken = "stale-refresh-access"
	if err := pool.persist(auth); err != nil {
		t.Fatal(err)
	}
	pool.unlockIssuer()
	select {
	case err := <-installDone:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("credential install deadlocked")
	}
	fresh, err := pool.FreshAuthFor(context.Background(), accs["a"].ID)
	if err != nil || fresh.Token.AccessToken != "new-access" {
		t.Fatalf("stale credentials won: %v", err)
	}
	if err := pool.lockIssuer(context.Background()); err != nil {
		t.Fatal(err)
	}
	removeDone := make(chan error, 1)
	go func() { removeDone <- pool.RemoveCredentials(context.Background(), accs["a"].ID) }()
	if err := pool.persist(fresh); err != nil {
		t.Fatal(err)
	}
	pool.unlockIssuer()
	select {
	case err := <-removeDone:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("credential removal deadlocked")
	}
	if _, err := pool.store.Credentials(accs["a"].ID); err == nil {
		t.Fatal("credentials survived removal")
	}
	if _, err := pool.FreshAuthFor(context.Background(), accs["a"].ID); err == nil {
		t.Fatal("deleted account cached auth resurrected")
	}
}
