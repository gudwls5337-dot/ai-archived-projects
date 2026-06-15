import os
import json
import csv
from typing import List, Dict
from datetime import datetime
from pathlib import Path
from .models import YoutubeShort
from config import OUTPUT_DIR


class DataStorage:
    @staticmethod
    def _ensure_output_dir():
        Path(OUTPUT_DIR).mkdir(parents=True, exist_ok=True)

    @staticmethod
    def _generate_filename(channel_name: str, sort_by: str, format: str) -> str:
        timestamp = datetime.now().strftime("%Y-%m-%d")
        return f"{channel_name}_shorts_{sort_by}_{timestamp}.{format}"

    @staticmethod
    def save_to_csv(shorts: List[Dict], channel_name: str, sort_by: str) -> str:
        DataStorage._ensure_output_dir()
        filename = DataStorage._generate_filename(channel_name, sort_by, "csv")
        filepath = os.path.join(OUTPUT_DIR, filename)

        if not shorts:
            raise ValueError("No shorts to save")

        try:
            fieldnames = [
                "video_id",
                "title",
                "duration",
                "views",
                "upload_date",
                "description",
                "hashtags",
                "transcript",
                "url",
            ]

            with open(filepath, "w", newline="", encoding="utf-8") as csvfile:
                writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
                writer.writeheader()
                for short in shorts:
                    row = {
                        "video_id": short.get("video_id", ""),
                        "title": short.get("title", ""),
                        "duration": short.get("duration", 0),
                        "views": short.get("views", 0),
                        "upload_date": short.get("upload_date", ""),
                        "description": short.get("description", ""),
                        "hashtags": ",".join(short.get("hashtags", [])),
                        "transcript": short.get("transcript", ""),
                        "url": short.get("url", ""),
                    }
                    writer.writerow(row)

            return filename
        except Exception as e:
            raise RuntimeError(f"Failed to save CSV: {str(e)}")

    @staticmethod
    def save_to_json(shorts: List[Dict], channel_name: str, sort_by: str) -> str:
        DataStorage._ensure_output_dir()
        filename = DataStorage._generate_filename(channel_name, sort_by, "json")
        filepath = os.path.join(OUTPUT_DIR, filename)

        if not shorts:
            raise ValueError("No shorts to save")

        try:
            with open(filepath, "w", encoding="utf-8") as jsonfile:
                json.dump(shorts, jsonfile, ensure_ascii=False, indent=2)

            return filename
        except Exception as e:
            raise RuntimeError(f"Failed to save JSON: {str(e)}")

    @staticmethod
    def save(
        shorts: List[Dict],
        channel_name: str,
        sort_by: str,
        format: str = "csv",
    ) -> str:
        if format == "json":
            return DataStorage.save_to_json(shorts, channel_name, sort_by)
        else:
            return DataStorage.save_to_csv(shorts, channel_name, sort_by)
