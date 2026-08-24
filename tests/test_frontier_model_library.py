"""Tests for FrontierModelLibrary and FreeCloudFailoverRouter."""

from __future__ import annotations

import unittest
from unittest.mock import patch

from src.providers.free_cloud_failover import next_free_cloud_provider, record_failover_lineage
from src.providers.frontier_model_library import (
    FREE_CLOUD_CHAT_FAILOVER_ORDER,
    MODEL_LIBRARY,
    library_snapshot,
    list_library,
)
from src.model_manager import model_manager


class TestFrontierModelLibrary(unittest.TestCase):
    def test_library_includes_core_modalities(self):
        snapshot = library_snapshot()
        self.assertEqual(snapshot["library_version"], "frontier_model_library.v1")
        for modality in ("chat", "image", "img2img", "voice_stt", "voice_tts", "music"):
            self.assertIn(modality, snapshot["modalities"])
            self.assertGreaterEqual(snapshot["counts"][modality], 1)

    def test_free_cloud_failover_order(self):
        self.assertEqual(
            FREE_CLOUD_CHAT_FAILOVER_ORDER[:3],
            ("nvidia", "openrouter", "groq"),
        )
        self.assertIn("local", FREE_CLOUD_CHAT_FAILOVER_ORDER)

    def test_list_library_filters(self):
        chat = list_library(modality="chat", free_only=True)
        self.assertTrue(chat)
        self.assertTrue(all(row["modality"] == "chat" and row["free_tier"] for row in chat))

    def test_model_manager_exposes_modalities(self):
        self.assertIn("meta/muse-glimmer-30b", model_manager.list_available_models("text"))
        self.assertTrue(model_manager.list_available_models("image"))
        self.assertTrue(model_manager.list_available_models("music"))

    def test_library_marks_creative_paths_available(self):
        statuses = {entry.id: entry.status for entry in MODEL_LIBRARY}
        self.assertEqual(statuses["img2img.local.sd15"], "available")
        self.assertEqual(statuses["music.hf.musicgen_small"], "available")


class TestFreeCloudFailover(unittest.TestCase):
    def test_next_skips_failed_and_picks_available(self):
        available = {"openrouter", "local"}

        def can_invoke(provider_id: str) -> bool:
            return provider_id in available

        nxt = next_free_cloud_provider("nvidia", can_invoke=can_invoke)
        self.assertEqual(nxt, "openrouter")

    def test_next_falls_through_to_local(self):
        nxt = next_free_cloud_provider(
            "nvidia",
            can_invoke=lambda provider_id: provider_id == "local",
            already_tried={"openrouter", "groq", "google"},
        )
        self.assertEqual(nxt, "local")

    def test_record_failover_lineage_uses_ul_lineage(self):
        with patch("src.ul_lineage.record_lineage_event", return_value={"node_id": "ln-test"}) as emit:
            node = record_failover_lineage(
                session_id="sess-1",
                session_metadata={"mission_board": {"active_mission": {"id": "m1"}}},
                failed_provider="nvidia",
                next_provider="openrouter",
                reason="429 rate limit",
            )
        self.assertEqual(node["node_id"], "ln-test")
        emit.assert_called_once()
        kwargs = emit.call_args.kwargs
        self.assertEqual(kwargs["node_type"], "capability_call")
        self.assertEqual(kwargs["payload"]["capability"], "free_cloud_provider_failover")


if __name__ == "__main__":
    unittest.main()
