# Frontend-only localization: the verified upstream Core binary is unchanged.
FROM nginx@sha256:a3554c0d0b48177b1413c26e01f695334428020d9df01243fbae3e11cfd17417
LABEL org.opencontainers.image.title="Arman VPN 简体中文面板" \
      org.opencontainers.image.version="1.0.18-zh-CN.1" \
      org.opencontainers.image.source="https://github.com/qingwo1991-debug/arman-vpn-client" \
      org.opencontainers.image.revision="405f412fa28c0f56bd2a0d85617558e7216d6b05"
COPY --chown=10003:10003 nginx.conf /etc/nginx/nginx.conf
COPY --chown=10003:10003 localized-headers.conf /etc/nginx/localized-headers.conf
COPY --chown=10003:10003 web /srv/dashboard
COPY LICENSE UPSTREAM.json /usr/share/doc/arman-vpn-dashboard/
USER 10003:10003
ENTRYPOINT ["nginx"]
CMD ["-g", "daemon off;"]
