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

            with open(filepath, "w", newline="", encoding="utf-8-sig") as csvfile:
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
    def save_to_xlsx(shorts: List[Dict], channel_name: str, sort_by: str) -> str:
        DataStorage._ensure_output_dir()
        filename = DataStorage._generate_filename(channel_name, sort_by, "xlsx")
        filepath = os.path.join(OUTPUT_DIR, filename)

        if not shorts:
            raise ValueError("No shorts to save")

        try:
            from openpyxl import Workbook
            from openpyxl.styles import Font, PatternFill, Alignment

            wb = Workbook()
            ws = wb.active
            ws.title = "Shorts"

            # 헤더
            headers = [
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
            ws.append(headers)

            # 헤더 스타일
            header_fill = PatternFill(start_color="4472C4", end_color="4472C4", fill_type="solid")
            header_font = Font(bold=True, color="FFFFFF")
            for cell in ws[1]:
                cell.fill = header_fill
                cell.font = header_font
                cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)

            # 데이터
            for short in shorts:
                ws.append([
                    short.get("video_id", ""),
                    short.get("title", ""),
                    short.get("duration", 0),
                    short.get("views", 0),
                    short.get("upload_date", ""),
                    short.get("description", ""),
                    ",".join(short.get("hashtags", [])),
                    short.get("transcript", ""),
                    short.get("url", ""),
                ])

            # 열 너비 자동 조정
            ws.column_dimensions["A"].width = 15
            ws.column_dimensions["B"].width = 40
            ws.column_dimensions["C"].width = 10
            ws.column_dimensions["D"].width = 12
            ws.column_dimensions["E"].width = 20
            ws.column_dimensions["F"].width = 50
            ws.column_dimensions["G"].width = 30
            ws.column_dimensions["H"].width = 50
            ws.column_dimensions["I"].width = 50

            # 텍스트 줄바꿈
            for row in ws.iter_rows(min_row=2):
                for cell in row:
                    cell.alignment = Alignment(wrap_text=True, vertical="top")

            wb.save(filepath)
            return filename

        except Exception as e:
            raise RuntimeError(f"Failed to save XLSX: {str(e)}")

    @staticmethod
    def save(
        shorts: List[Dict],
        channel_name: str,
        sort_by: str,
        format: str = "csv",
    ) -> str:
        if format == "json":
            return DataStorage.save_to_json(shorts, channel_name, sort_by)
        elif format == "xlsx":
            return DataStorage.save_to_xlsx(shorts, channel_name, sort_by)
        else:
            return DataStorage.save_to_csv(shorts, channel_name, sort_by)
