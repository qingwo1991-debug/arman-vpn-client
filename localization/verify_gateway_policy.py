#!/usr/bin/env python3
"""Check that the LAN gateway cannot invoke the privileged local-token API."""
from pathlib import Path
import json
from urllib.request import Request,build_opener,ProxyHandler
from urllib.error import HTTPError
root=Path(__file__).resolve().parents[1]
token=(root/'core-data/local-api.token').read_text().strip()
req=Request('http://192.168.1.15:10820/api/session/link',method='POST',data=b'{}',headers={'Content-Type':'application/json','X-Local-Token':token})
op=build_opener(ProxyHandler({}))
try:
    with op.open(req,timeout=10) as response:
        raise AssertionError('Gateway exposed a privileged local-token endpoint: '+str(response.status))
except HTTPError as error:
    assert error.code==401,error.code
print('Gateway strips X-Local-Token; anonymous local-token privileged request rejected with 401.')
