"""Tests for img2img and music generation surfaces."""

from __future__ import annotations

import base64
import io
import unittest
from unittest.mock import MagicMock, patch

from PIL import Image

from src.music_generation import MusicGenerationAdapter, _synthetic_preview_wav
from src.mock_ai import MockMultiModalAI


class TestMockImg2Img(unittest.TestCase):
    def test_mock_img2img_returns_pil(self):
        ai = MockMultiModalAI()
        source = Image.new("RGB", (64, 64), "#112233")
        out = ai.generate_image_to_image("make it neon", source, strength=0.5)
        self.assertEqual(out.size, (1024, 768))


class TestMusicGeneration(unittest.TestCase):
    def test_synthetic_preview_wav(self):
        result = _synthetic_preview_wav(prompt="piano rain", duration_sec=1.0)
        self.assertEqual(result["format"], "wav")
        self.assertGreater(len(result["audio"]), 100)
        self.assertEqual(result["model"], "synthetic-preview")

    def test_adapter_uses_synthetic_when_allowed(self):
        adapter = MusicGenerationAdapter()
        with patch.dict("os.environ", {"AAIS_DISABLE_MUSIC_GENERATION": "true"}, clear=False):
            result = adapter.generate("soft drums", duration_sec=2.0, allow_synthetic=True)
        self.assertEqual(result["format"], "wav")
        self.assertTrue(result["audio"])


class TestCreativeApiRoutes(unittest.TestCase):
    def setUp(self):
        from src.api import app

        self.client = app.test_client()

    @patch("src.api.init_ai")
    def test_img2img_returns_png(self, mock_init_ai):
        fake = MagicMock()
        fake.generate_image_to_image.return_value = Image.new("RGB", (32, 32), "#abcdef")
        mock_init_ai.return_value = (fake, object())

        buffer = io.BytesIO()
        Image.new("RGB", (16, 16), "#000000").save(buffer, format="PNG")
        buffer.seek(0)

        response = self.client.post(
            "/api/image/img2img",
            data={
                "prompt": "oil painting",
                "strength": "0.5",
                "num_inference_steps": "20",
                "image": (buffer, "source.png"),
            },
            content_type="multipart/form-data",
        )
        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(payload["format"], "png")
        self.assertTrue(payload["image"])
        base64.b64decode(payload["image"])

    @patch("src.api._load_module")
    def test_music_generate_returns_wav(self, mock_load):
        music_mod = MagicMock()
        music_mod.music_generation_adapter.generate.return_value = {
            "format": "wav",
            "sample_rate": 16000,
            "model": "synthetic-preview",
            "audio": b"RIFF....",
            "duration_sec": 2.0,
            "prompt": "lofi",
        }
        mock_load.return_value = music_mod

        response = self.client.post(
            "/api/audio/music/generate",
            json={"prompt": "lofi beat", "duration_sec": 2},
        )
        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(payload["format"], "wav")
        self.assertEqual(payload["model"], "synthetic-preview")


if __name__ == "__main__":
    unittest.main()
