package proxy

import (
	"encoding/base64"
	"io"
	"net"
	"net/http"
	"sync/atomic"
	"testing"
	"time"
)

func TestRegionalHTTPAuthenticationAndStrictRoutes(t *testing.T) {
	var calls atomic.Int32
	callback := func(r *http.Request) ([]byte, int) {
		calls.Add(1)
		return []byte(`{"allowed":true,"epoch":"fixture"}`), 200
	}
	opener := &countingOpener{}
	server := &SOCKSServer{Auth: SOCKSCredentials("fixture-user", "fixture-pass"), RegionHTTP: callback, handshakeTimeout: time.Second, upstream: opener}
	addr := startMixedProxy(t, server)
	auth := "Proxy-Authorization: Basic " + base64.StdEncoding.EncodeToString([]byte("fixture-user:fixture-pass")) + "\r\n"
	for _, tc := range []struct {
		name, method, target, extra, body string
		status                            int
	}{
		{"unauthenticated", "GET", "http://firefox-regions.internal/v1/status", "", "", 407},
		{"status", "GET", "http://firefox-regions.internal/v1/status", auth, "", 200},
		{"lease", "POST", "http://firefox-regions.internal/v1/lease", auth + "Content-Type: application/json\r\nContent-Length: 2\r\n", "{}", 200},
		{"wrong path", "GET", "http://firefox-regions.internal/v1/unknown", auth, "", 404},
		{"wrong method", "DELETE", "http://firefox-regions.internal/v1/status", auth, "", 404},
		{"query", "GET", "http://firefox-regions.internal/v1/status?x", auth, "", 400},
		{"port", "GET", "http://firefox-regions.internal:80/v1/status", auth, "", 400},
		{"connect", "CONNECT", "firefox-regions.internal:443", auth, "", 400},
		{"trailing dot get", "GET", "http://firefox-regions.internal./v1/unknown", auth, "", 400},
		{"trailing dot connect", "CONNECT", "FIREFOX-REGIONS.INTERNAL.:443", auth, "", 400},
		{"origin form", "GET", "/v1/status", auth, "", 400},
		{"missing json", "POST", "http://firefox-regions.internal/v1/lease", auth + "Content-Length: 2\r\n", "{}", 400},
		{"extra body", "POST", "http://firefox-regions.internal/v1/lease", auth + "Content-Type: application/json\r\nContent-Length: 7\r\n", "{\"x\":1}", 400},
		{"large body", "POST", "http://firefox-regions.internal/v1/lease", auth + "Content-Type: application/json\r\nContent-Length: 1025\r\n", "", 400},
	} {
		t.Run(tc.name, func(t *testing.T) {
			resp, _, _ := rawRequest(t, addr, tc.method+" "+tc.target+" HTTP/1.1\r\nHost: firefox-regions.internal\r\n"+tc.extra+"\r\n"+tc.body)
			defer resp.Body.Close()
			io.Copy(io.Discard, resp.Body)
			if resp.StatusCode != tc.status {
				t.Fatalf("status=%d want=%d", resp.StatusCode, tc.status)
			}
		})
	}
	if calls.Load() != 2 || opener.opened.Load() != 0 {
		t.Fatalf("callbacks=%d want2 upstream=%d want0", calls.Load(), opener.opened.Load())
	}
	// SOCKS uses the same openTarget guard, including DNS terminal-dot and
	// case variants; none may reach its upstream opener.
	for _, host := range []string{regionalHost, "FIREFOX-REGIONS.INTERNAL."} {
		conn, err := net.Dial("tcp", addr)
		if err != nil {
			t.Fatal(err)
		}
		conn.SetDeadline(time.Now().Add(time.Second))
		conn.Write([]byte{5, 1, 2})
		reply := make([]byte, 2)
		if _, err := io.ReadFull(conn, reply); err != nil {
			t.Fatal(err)
		}
		login := []byte{1, byte(len("fixture-user"))}
		login = append(login, []byte("fixture-user")...)
		login = append(login, byte(len("fixture-pass")))
		login = append(login, []byte("fixture-pass")...)
		conn.Write(login)
		if _, err := io.ReadFull(conn, reply); err != nil || reply[1] != 0 {
			t.Fatal("socks auth failed", err)
		}
		request := []byte{5, 1, 0, 3, byte(len(host))}
		request = append(request, []byte(host)...)
		request = append(request, 1, 187)
		conn.Write(request)
		result := make([]byte, 10)
		_, err = io.ReadFull(conn, result)
		conn.Close()
		if err != nil || result[1] == 0 {
			t.Fatal("reserved SOCKS admitted", err)
		}
	}
	if opener.opened.Load() != 0 {
		t.Fatal("reserved SOCKS reached upstream")
	}

	noAuthAddr := startMixedProxy(t, &SOCKSServer{RegionHTTP: callback, handshakeTimeout: time.Second})
	resp, _, _ := rawRequest(t, noAuthAddr, "GET http://firefox-regions.internal/v1/status HTTP/1.1\r\nHost: firefox-regions.internal\r\n\r\n")
	resp.Body.Close()
	if resp.StatusCode != 403 {
		t.Fatalf("no configured auth status=%d", resp.StatusCode)
	}
}
