
from fastapi import Request
import coc

def get_coc_client(request: Request) -> coc.Client:
    return request.app.state.coc_client