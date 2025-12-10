from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import os
import requests

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

if not os.path.exists('static'):
    os.makedirs('static')
app.mount('/static', StaticFiles(directory='static'), name='static')

class ComplianceResponse(BaseModel):
    ok: bool
    issues: list[str]

@app.get('/')
def root():
    return {'status': 'Ad Genius Backend Running'}

@app.post('/background/remove')
async def remove_background(file: UploadFile = File(...)):
    contents = await file.read()
    fname = f'static/{file.filename}'
    with open(fname, 'wb') as f:
        f.write(contents)

    API_KEY = os.getenv('REMOVE_BG_API_KEY')
    if API_KEY:
        try:
            resp = requests.post(
                'https://api.remove.bg/v1.0/removebg',
                files={'image_file': (file.filename, contents)},
                data={'size': 'auto'},
                headers={'X-Api-Key': API_KEY},
                timeout=30
            )
            if resp.status_code == 200:
                out_path = f'static/processed_{file.filename}'
                with open(out_path, 'wb') as out:
                    out.write(resp.content)
                return {'success': True, 'url': f'http://localhost:8000/static/processed_{file.filename}'}
            else:
                return {'success': False, 'url': f'http://localhost:8000/static/{file.filename}', 'error': resp.text}
        except Exception as e:
            return {'success': False, 'url': f'http://localhost:8000/static/{file.filename}', 'error': str(e)}
    else:
        return {'success': False, 'url': f'http://localhost:8000/static/{file.filename}', 'error': 'NO_API_KEY'}

@app.post('/compliance/check', response_model=ComplianceResponse)
async def check_compliance(data: dict):
    text = data.get('text','')
    issues = []
    banned = ['scam','free money','guaranteed results']
    for word in banned:
        if word in text.lower():
            issues.append(f'Contains banned phrase: {word}')
    return ComplianceResponse(ok=len(issues)==0, issues=issues)

@app.post("/ai/arrange")
async def ai_arrange(payload: dict):
    elements = payload.get("elements", [])
    canvas = payload.get("canvas", {"w": 1200, "h": 628})

    arranged = []
    spacing = 20
    x = spacing
    y = spacing

    for el in elements:
        arranged.append({
            **el,
            "x": x,
            "y": y
        })
        y += (el.get("h", 200) + spacing)

    suggestions = [{
        "type": "Simple Vertical Layout",
        "elements": arranged
    }]

    return {"suggestions": suggestions}



