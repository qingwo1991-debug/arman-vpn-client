package proxy

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime"
	"net"
	"net/http"
	"strings"
	"time"
)

const regionalHost = "firefox-regions.internal"

// Recognize DNS-equivalent spellings to reserve the name across both HTTP
// and SOCKS. The HTTP API itself still accepts only its exact canonical URL.
func isRegionalHost(host string) bool {
	if h, _, err := net.SplitHostPort(host); err == nil {
		host = h
	}
	return strings.EqualFold(strings.TrimSuffix(host, "."), regionalHost)
}

// The reserved host can never escape through the upstream (even when the
// extension is disabled). Authentication was checked by serveHTTP first.
func (s *SOCKSServer) serveRegionHTTP(client net.Conn, req *http.Request) bool {
	host := req.Host
	if h, _, err := net.SplitHostPort(host); err == nil {
		host = h
	}
	urlHost := ""
	if req.URL != nil {
		urlHost = req.URL.Hostname()
	}
	if !isRegionalHost(host) && !isRegionalHost(urlHost) {
		return false
	}
	send := func(status int, body []byte) {
		_ = client.SetWriteDeadline(time.Now().Add(5 * time.Second))
		_, _ = fmt.Fprintf(client, "HTTP/1.1 %d %s\r\nContent-Type: application/json\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nContent-Length: %d\r\nConnection: close\r\n\r\n", status, http.StatusText(status), len(body))
		_, _ = client.Write(body)
	}
	refuse := func(status int) { send(status, []byte(`{"allowed":false,"reason":"invalid_request"}`)) }
	headerBytes := len(req.RequestURI) + len(req.Host)
	for key, values := range req.Header {
		headerBytes += len(key)
		for _, value := range values {
			headerBytes += len(value) + 4
		}
	}
	if headerBytes > 16384 {
		refuse(http.StatusRequestHeaderFieldsTooLarge)
		return true
	}
	if s.Auth == nil || s.RegionHTTP == nil {
		refuse(http.StatusForbidden)
		return true
	}
	if req.URL == nil || req.URL.Scheme != "http" || req.URL.Host != regionalHost || req.Host != regionalHost || req.URL.User != nil || req.URL.RawQuery != "" || req.URL.ForceQuery || req.URL.Fragment != "" || req.URL.RawPath != "" || len(req.TransferEncoding) != 0 || req.Header.Get("Expect") != "" {
		refuse(http.StatusBadRequest)
		return true
	}
	if !(req.Method == http.MethodGet && req.URL.Path == "/v1/status") && !(req.Method == http.MethodPost && req.URL.Path == "/v1/lease") {
		refuse(http.StatusNotFound)
		return true
	}
	_ = client.SetReadDeadline(time.Now().Add(5 * time.Second))
	defer req.Body.Close()
	if req.Method == http.MethodGet {
		if req.ContentLength != 0 {
			refuse(http.StatusBadRequest)
			return true
		}
	} else {
		media, _, err := mime.ParseMediaType(req.Header.Get("Content-Type"))
		if err != nil || media != "application/json" || req.ContentLength < 0 || req.ContentLength > 1024 {
			refuse(http.StatusBadRequest)
			return true
		}
		body, err := io.ReadAll(io.LimitReader(req.Body, 1025))
		var object map[string]json.RawMessage
		if err != nil || len(body) > 1024 || json.Unmarshal(body, &object) != nil || object == nil || len(object) != 0 || !bytes.HasPrefix(bytes.TrimSpace(body), []byte("{")) {
			refuse(http.StatusBadRequest)
			return true
		}
	}
	_ = client.SetReadDeadline(time.Time{})
	ctx, cancel := context.WithTimeout(req.Context(), 30*time.Second)
	defer cancel()
	body, status := s.RegionHTTP(req.WithContext(ctx))
	if len(body) > 49152 || status < 200 || status > 599 {
		refuse(http.StatusServiceUnavailable)
		return true
	}
	send(status, body)
	return true
}
