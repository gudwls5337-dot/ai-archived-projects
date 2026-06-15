from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
import os
from pathlib import Path

from youtube_api.scraper import YouTubeShortsScra
from youtube_api.transcript import TranscriptExtractor
from data.models import ScrapeRequest, ScrapeResponse
from data.storage import DataStorage
from config import OUTPUT_DIR, ALLOWED_FORMATS, DEFAULT_FORMAT

app = FastAPI(
    title="YouTube 쇼츠 정보 추출",
    description="YouTube 채널의 쇼츠 영상 정보를 자동으로 추출하고 저장합니다.",
    version="1.0.0",
)


@app.post("/scrape", response_model=ScrapeResponse)
async def scrape_shorts(request: ScrapeRequest, background_tasks: BackgroundTasks):
    """
    YouTube 채널의 쇼츠 정보를 추출합니다.

    - **channel_url**: YouTube 채널 URL (예: https://www.youtube.com/@channelname)
    - **max_results**: 추출할 쇼츠 개수 (기본값: 50, 최대: 200)
    - **sort_by**: 정렬 방식 ("newest" 또는 "popular", 기본값: "newest")
    - **output_format**: 저장 형식 ("csv" 또는 "json", 기본값: "csv")
    """
    try:
        # Validate input
        if request.output_format not in ALLOWED_FORMATS:
            raise ValueError(f"Invalid format. Allowed: {ALLOWED_FORMATS}")

        # Extract channel info
        channel_identifier = YouTubeShortsScra.get_channel_id(request.channel_url)
        channel_name = channel_identifier.replace("@", "")

        # Get shorts
        scraper = YouTubeShortsScra()
        upload_playlist_id = scraper.get_upload_playlist_id(channel_identifier)
        shorts = scraper.get_shorts(
            playlist_id=upload_playlist_id,
            max_results=request.max_results,
            sort_by=request.sort_by,
        )

        if not shorts:
            raise ValueError("No shorts found for this channel")

        # Extract transcripts
        video_ids = [short["video_id"] for short in shorts]
        transcripts = TranscriptExtractor.batch_extract(video_ids)

        for short in shorts:
            short["transcript"] = transcripts.get(short["video_id"], "자막 없음")

        # Save to file
        filename = DataStorage.save(
            shorts=shorts,
            channel_name=channel_name,
            sort_by=request.sort_by,
            format=request.output_format,
        )

        return ScrapeResponse(
            status="success",
            shorts_count=len(shorts),
            filename=filename,
            download_url=f"/download/{filename}",
        )

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Server error: {str(e)}")


@app.get("/download/{filename}")
async def download_file(filename: str):
    """생성된 CSV/JSON 파일을 다운로드합니다."""
    try:
        file_path = os.path.join(OUTPUT_DIR, filename)

        # Security check
        if not os.path.exists(file_path) or not os.path.isfile(file_path):
            raise HTTPException(status_code=404, detail="File not found")

        # Prevent directory traversal
        real_path = os.path.realpath(file_path)
        output_real_path = os.path.realpath(OUTPUT_DIR)
        if not real_path.startswith(output_real_path):
            raise HTTPException(status_code=403, detail="Access denied")

        return FileResponse(
            file_path,
            media_type="application/octet-stream",
            filename=filename,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/")
async def root():
    """API 정보"""
    return {
        "name": "YouTube 쇼츠 정보 추출 API",
        "version": "1.0.0",
        "endpoints": {
            "scrape": "POST /scrape - 쇼츠 정보 추출",
            "download": "GET /download/{filename} - 결과 파일 다운로드",
            "docs": "/docs - API 문서",
        },
    }


@app.get("/health")
async def health_check():
    """헬스 체크"""
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
