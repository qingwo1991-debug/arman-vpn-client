package proxy

import (
	"context"
	"github.com/armanlife/arman-vpn-client/core/internal/accounts"
	"github.com/armanlife/arman-vpn-client/core/internal/fxa"
	"github.com/armanlife/arman-vpn-client/core/internal/guardian"
	"github.com/armanlife/arman-vpn-client/core/internal/logx"
	"time"
)

func (p *AccountPool) lockIssuer(ctx context.Context) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	select {
	case p.issuer <- struct{}{}:
		// Both branches may become ready together. Never hand a cancelled
		// regional caller the issuer after a native operation releases it.
		if err := ctx.Err(); err != nil {
			p.unlockIssuer()
			return err
		}
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}
func (p *AccountPool) unlockIssuer() { <-p.issuer }

// InstallCredentials commits a completed sign-in, not the interactive sign-in
// itself, under the same lock as every rotating-token persist operation.
func (p *AccountPool) InstallCredentials(ctx context.Context, email, password string, creds *fxa.SavedTokens, now time.Time) (accounts.Account, bool, error) {
	if err := p.lockIssuer(ctx); err != nil {
		return accounts.Account{}, false, err
	}
	defer p.unlockIssuer()
	acc, created, err := p.store.Add(email, creds, now)
	if err != nil {
		return acc, created, err
	}
	p.Forget(acc.ID)
	if password != "" {
		if err := p.store.SetPassword(acc.ID, password); err != nil {
			logx.Warn("saving the account password failed account=%s err=%s", logx.Email(acc.Name()), logx.Err(err))
		}
	}
	return acc, created, nil
}

// RemoveCredentials cannot race a stale refresh persisting the deleted file.
func (p *AccountPool) RemoveCredentials(ctx context.Context, id string) error {
	if err := p.lockIssuer(ctx); err != nil {
		return err
	}
	defer p.unlockIssuer()
	if err := p.store.Remove(id); err != nil {
		return err
	}
	p.Forget(id)
	return nil
}

// FreshAuthFor reads the most recently persisted/cached auth under the same
// issuer lock as AcquirePass, rather than refreshing a Controller's stale
// refresh token after a regional request rotated it.
func (p *AccountPool) FreshAuthFor(ctx context.Context, id string) (*runtimeAuth, error) {
	if err := p.lockIssuer(ctx); err != nil {
		return nil, err
	}
	defer p.unlockIssuer()
	return p.freshAuthForLocked(ctx, id)
}
func (p *AccountPool) freshAuthForLocked(ctx context.Context, id string) (*runtimeAuth, error) {
	acc, err := p.store.Get(id)
	if err != nil {
		return nil, err
	}
	return p.freshAuthLocked(ctx, acc)
}
func (p *AccountPool) freshAuthLocked(ctx context.Context, acc accounts.Account) (*runtimeAuth, error) {
	auth, err := p.AuthFor(acc)
	if err != nil {
		return nil, err
	}
	return FreshRuntimeAuth(ctx, auth)
}

// FetchUsage serializes quota-driven OAuth refresh with native and regional
// pass issuance. It mints no pass and retains upstream's HEAD quota behavior,
// including the explicit refresh used by the dashboard's manual quota button.
func (p *AccountPool) FetchUsage(ctx context.Context, endpoint string, acc accounts.Account, manual bool) (*guardian.ProxyUsage, error) {
	if err := p.lockIssuer(ctx); err != nil {
		return nil, err
	}
	defer p.unlockIssuer()
	auth, err := p.freshAuthLocked(ctx, acc)
	if err != nil {
		return nil, err
	}
	if manual {
		return guardian.RefreshProxyUsage(ctx, endpoint, auth.Token.AccessToken)
	}
	return guardian.FetchProxyUsage(ctx, endpoint, auth.Token.AccessToken)
}
