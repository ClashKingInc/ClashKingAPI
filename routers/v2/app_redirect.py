from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from urllib.parse import urlencode

router = APIRouter(prefix="app", tags=["App Redirect"], include_in_schema=False)

@router.get("/{path:path}", include_in_schema=False)
async def app_redirect(path: str, request: Request):
    """Generic deep link endpoint that redirects to the ClashKing mobile app."""
    
    # Build the deep link URL
    deep_link = f"clashking://{path}"
    
    # Add query parameters if any
    query_params = request.query_params
    if query_params:
        deep_link += f"?{urlencode(query_params)}"
    
    # Page content based on the path
    page_configs = {
        "verify-email": {
            "title": "Email Verification",
            "heading": "Email Verification",
            "description": "Click the button below to verify your email and open the ClashKing app:",
            "button_text": "Verify Email",
            "fallback_text": "If the app doesn't open automatically, copy this verification code and paste it in the ClashKing app:",
            "show_token": True
        },
        "oauth": {
            "title": "Authentication",
            "heading": "Authentication Complete",
            "description": "Click the button below to return to the ClashKing app:",
            "button_text": "Open ClashKing App",
            "fallback_text": "Authentication completed. Please return to the ClashKing app.",
            "show_token": False
        }
    }
    
    # Default config for unknown paths
    config = page_configs.get(path.split('?')[0], {
        "title": "Open ClashKing App",
        "heading": "Open ClashKing App",
        "description": "Click the button below to open the ClashKing app:",
        "button_text": "Open ClashKing App",
        "fallback_text": "Please open the ClashKing app to continue.",
        "show_token": False
    })
    
    # Get token from query params if present
    token = request.query_params.get("token", "")
    
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>{config['title']} - ClashKing</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            body {{
                font-family: Arial, sans-serif;
                text-align: center;
                padding: 50px;
                background-color: #f5f5f5;
                margin: 0;
            }}
            .container {{
                max-width: 600px;
                margin: 0 auto;
                background: white;
                padding: 40px;
                border-radius: 10px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            }}
            .logo {{
                width: 80px;
                height: 80px;
                background: #D90709;
                border-radius: 50%;
                margin: 0 auto 30px;
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
                font-size: 24px;
                font-weight: bold;
            }}
            h1 {{
                color: #D90709;
                margin-bottom: 20px;
            }}
            .button {{
                display: inline-block;
                padding: 15px 30px;
                background: #D90709;
                color: white;
                text-decoration: none;
                border-radius: 6px;
                margin: 20px 10px;
                font-weight: bold;
                transition: background-color 0.3s;
            }}
            .button:hover {{
                background: #B8060A;
            }}
            .instructions {{
                margin: 30px 0;
                color: #666;
                line-height: 1.6;
            }}
            .fallback {{
                margin-top: 30px;
                padding: 20px;
                background: #f9f9f9;
                border-radius: 6px;
                color: #666;
            }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="logo">CK</div>
            <h1>{config['heading']}</h1>
            <p>{config['description']}</p>
            
            <a href="{deep_link}" class="button">{config['button_text']}</a>
            
            <div class="instructions">
                <p><strong>Don't have the app installed?</strong></p>
                <p>Download ClashKing from your app store first, then click the button again.</p>
            </div>
            
            <div class="fallback">
                <p><strong>Having trouble?</strong></p>
                <p>{config['fallback_text']}</p>
                {f'''<p style="font-family: monospace; background: white; padding: 10px; border-radius: 4px; word-break: break-all;">
                    {token}
                </p>''' if config['show_token'] and token else ''}
            </div>
        </div>
        
        <script>
            // Automatically try to open the app after 2 seconds
            setTimeout(function() {{
                window.location.href = "{deep_link}";
            }}, 2000);
        </script>
    </body>
    </html>
    """
    
    return HTMLResponse(content=html_content)

@router.get("/verify-email", include_in_schema=False)
async def verify_email_redirect(token: str):
    """Legacy endpoint that redirects to the generic app endpoint."""
    return RedirectResponse(url=f"/app/verify-email?token={token}", status_code=301)