from fastapi import FastAPI
from google.cloud import storage

app = FastAPI()
storage_client = storage.Client()
BUCKET_NAME = "hyungjin-recordings" # 본인의 버킷 이름과 동일해야 합니다

@app.get("/list")
async def list_files(prefix: str):
    blobs = storage_client.list_blobs(BUCKET_NAME, prefix=prefix)
    return {"files": [blob.name for blob in blobs]}