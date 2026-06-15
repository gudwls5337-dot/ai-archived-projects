#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
YouTube 쇼츠 정보 추출 CLI 스크립트

사용법:
  python scraper.py --url "https://www.youtube.com/@MrBeast" --max 50 --sort newest
  python scraper.py -u "https://www.youtube.com/@TED" -m 30 -s popular
"""

import argparse
import sys
import os
from pathlib import Path

# Windows UTF-8 인코딩 설정
if sys.platform == "win32":
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8")

# 현재 스크립트의 디렉토리를 Python 경로에 추가
script_dir = Path(__file__).parent
sys.path.insert(0, str(script_dir))

from youtube_api.scraper import YouTubeShortsScraper
from data.storage import DataStorage
from config import MAX_RESULTS_DEFAULT, MAX_RESULTS_LIMIT


def main():
    parser = argparse.ArgumentParser(
        description="YouTube 채널의 쇼츠 정보를 추출하고 CSV/JSON으로 저장합니다.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
예제:
  # 기본 설정으로 MrBeast 채널의 50개 쇼츠 추출 (최신순)
  python scraper.py --url "https://www.youtube.com/@MrBeast"

  # 100개를 인기순으로 추출
  python scraper.py -u "https://www.youtube.com/@TED" -m 100 -s popular

  # JSON 형식으로 저장
  python scraper.py -u "https://www.youtube.com/@NASA" -f json

  # 짧은 옵션들 조합
  python scraper.py -u "https://www.youtube.com/@CodeAsArt" -m 30 -s popular -f json
        """,
    )

    parser.add_argument(
        "-u",
        "--url",
        required=True,
        help="YouTube 채널 URL (예: https://www.youtube.com/@channelname)",
    )

    parser.add_argument(
        "-m",
        "--max",
        type=int,
        default=MAX_RESULTS_DEFAULT,
        help=f"추출할 쇼츠 개수 (기본: {MAX_RESULTS_DEFAULT}, 최대: {MAX_RESULTS_LIMIT})",
    )

    parser.add_argument(
        "-s",
        "--sort",
        choices=["newest", "popular"],
        default="newest",
        help="정렬 방식 (기본: newest)",
    )

    parser.add_argument(
        "-f",
        "--format",
        choices=["csv", "json", "xlsx"],
        default="csv",
        help="저장 형식 (기본: csv)",
    )

    parser.add_argument(
        "-o",
        "--output",
        help="출력 폴더 (기본: data/output)",
    )

    parser.add_argument(
        "-v",
        "--verbose",
        action="store_true",
        help="상세 로그 출력",
    )

    parser.add_argument(
        "--api-key",
        help="YouTube API 키 (.env 파일에 YOUTUBE_API_KEY가 없을 때 사용)",
    )

    args = parser.parse_args()

    # 입력값 검증
    if args.max > MAX_RESULTS_LIMIT:
        print(f"⚠️  최대값은 {MAX_RESULTS_LIMIT}입니다. {MAX_RESULTS_LIMIT}로 조정됩니다.")
        args.max = MAX_RESULTS_LIMIT

    try:
        print("\n" + "=" * 60)
        print("🎬 YouTube 쇼츠 정보 추출 시작")
        print("=" * 60)

        if args.verbose:
            print(f"\n📋 설정:")
            print(f"  • 채널: {args.url}")
            print(f"  • 추출 개수: {args.max}개")
            print(f"  • 정렬: {args.sort}")
            print(f"  • 형식: {args.format}")

        # 1. 채널 ID 추출
        print(f"\n🔍 채널 정보 조회 중...")
        channel_identifier = YouTubeShortsScraper.get_channel_id(args.url)
        channel_name = channel_identifier.replace("@", "")
        if args.verbose:
            print(f"  ✓ 채널명: {channel_name}")

        # 2. 쇼츠 수집
        print(f"\n📥 쇼츠 데이터 수집 중...")
        scraper = YouTubeShortsScraper(api_key=args.api_key)
        upload_playlist_id = scraper.get_upload_playlist_id(channel_identifier)
        if args.verbose:
            print(f"  ✓ 플레이리스트 ID: {upload_playlist_id}")

        shorts = scraper.get_shorts(
            playlist_id=upload_playlist_id,
            max_results=args.max,
            sort_by=args.sort,
        )

        if not shorts:
            print("❌ 쇼츠를 찾을 수 없습니다.")
            return 1

        print(f"  ✓ {len(shorts)}개 쇼츠 발견")

        # 3. 자막 추출 (Whisper 음성 인식)
        print(f"\n📝 자막 추출 중 (Whisper 음성 인식)...")
        try:
            import subprocess
            from pathlib import Path
            import whisper

            temp_dir = Path("temp_shorts")
            temp_dir.mkdir(exist_ok=True)

            # Whisper 모델을 한 번만 로드
            print("  Whisper 모델 로드 중...")
            model = whisper.load_model("base")

            video_ids = [short["video_id"] for short in shorts]
            transcripts = {}

            for i, video_id in enumerate(video_ids, 1):
                try:
                    print(f"  자막 추출: {i}/{len(video_ids)}")

                    # yt-dlp로 영상 다운로드
                    video_path = temp_dir / f"{video_id}.mp4"
                    shorts_url = f"https://www.youtube.com/shorts/{video_id}"

                    dl_cmd = [
                        "yt-dlp",
                        "-f", "best",
                        "-o", str(video_path),
                        shorts_url
                    ]

                    result = subprocess.run(dl_cmd, capture_output=True, timeout=30)

                    if result.returncode == 0 and video_path.exists():
                        # Whisper로 음성 인식
                        whisper_result = model.transcribe(str(video_path), language=None)
                        transcripts[video_id] = whisper_result.get("text", "자막 없음").strip()

                        # 임시 파일 삭제
                        try:
                            video_path.unlink(missing_ok=True)
                        except:
                            pass
                    else:
                        transcripts[video_id] = "다운로드 실패"

                except Exception as e:
                    transcripts[video_id] = "자막 추출 실패"

            for short in shorts:
                short["transcript"] = transcripts.get(short["video_id"], "자막 없음")

            success_count = sum(1 for v in transcripts.values() if v not in ["자막 없음", "다운로드 실패"] and v != "자막 추출 실패")
            print(f"  ✓ {success_count}/{len(shorts)} 자막 추출 성공")

            # 임시 폴더 정리
            import shutil
            try:
                if temp_dir.exists():
                    shutil.rmtree(temp_dir)
            except:
                pass

        except Exception as e:
            print(f"  ⚠️ Whisper 자막 추출 오류: {e}")
            for short in shorts:
                short["transcript"] = "자막 추출 실패"

        # 4. 데이터 저장
        print(f"\n💾 데이터 저장 중...")
        filename = DataStorage.save(
            shorts=shorts,
            channel_name=channel_name,
            sort_by=args.sort,
            format=args.format,
        )

        output_path = os.path.join("data/output", filename)
        print(f"  ✓ 파일 저장 완료: {output_path}")

        # 5. 결과 요약
        print("\n" + "=" * 60)
        print("✅ 추출 완료!")
        print("=" * 60)
        print(f"\n📊 결과 요약:")
        print(f"  • 채널: {channel_name}")
        print(f"  • 추출된 쇼츠: {len(shorts)}개")
        print(f"  • 정렬: {args.sort}")
        print(f"  • 형식: {args.format}")
        print(f"  • 저장 위치: {output_path}")

        # 추가 통계
        if args.verbose:
            total_views = sum(short["views"] for short in shorts)
            avg_duration = sum(short["duration"] for short in shorts) / len(shorts)
            print(f"\n📈 추가 통계:")
            print(f"  • 총 조회수: {total_views:,}")
            print(f"  • 평균 길이: {avg_duration:.1f}초")
            print(f"  • 최신: {shorts[0]['upload_date']}")
            print(f"  • 가장 오래됨: {shorts[-1]['upload_date']}")

        print("\n" + "=" * 60)
        return 0

    except ValueError as e:
        print(f"\n❌ 입력 오류: {e}")
        return 1
    except Exception as e:
        print(f"\n❌ 오류 발생: {e}")
        if args.verbose:
            import traceback

            traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
