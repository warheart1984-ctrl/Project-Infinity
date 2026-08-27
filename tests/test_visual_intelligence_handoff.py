"""Tests for VisualIntelligenceHandoffAdapter."""

from __future__ import annotations

import unittest
from unittest import mock

from src.constitutional_task_bus import TaskBusIntentParser
from src.constitutional_task_bus.bus import ConstitutionalTaskBus
from src.constitutional_task_bus.lanes.picture_generation import PictureGenerationLane
from src.constitutional_task_bus.visual_intelligence_handoff import (
    VISUAL_CREATION_COMPLETE_TOKEN,
    parse_visual_intelligence_handoff,
)


class TestVisualIntelligenceHandoffParse(unittest.TestCase):
    def test_detects_suffix_and_strips_token(self) -> None:
        body = "A crystalline forest under aurora"
        raw = f"{body} {VISUAL_CREATION_COMPLETE_TOKEN.upper()}"
        result = parse_visual_intelligence_handoff(raw)
        self.assertTrue(result["matched"])
        self.assertEqual(result["body"], body)
        self.assertEqual(result["intent"]["kind"], "picture")
        self.assertEqual(
            result["intent"]["tags"],
            ["visual_intelligence", "authorized"],
        )
        self.assertEqual(len(result["pictures"]), 1)
        self.assertEqual(result["pictures"][0]["action"], "make_picture")
        self.assertEqual(result["pictures"][0]["target"], body)
        self.assertNotIn("perfection", result["body"])

    def test_rejects_token_only(self) -> None:
        result = parse_visual_intelligence_handoff(VISUAL_CREATION_COMPLETE_TOKEN)
        self.assertFalse(result["matched"])


class TestVisualIntelligenceHandoffIntentParser(unittest.TestCase):
    def setUp(self) -> None:
        self.parser = TaskBusIntentParser()

    def test_classifies_handoff_as_picture_lane(self) -> None:
        body = "Ocean mandala with teal gradients"
        intent = self.parser.classify(f"{body} {VISUAL_CREATION_COMPLETE_TOKEN}")
        self.assertEqual(intent["kind"], "picture")
        self.assertEqual(intent["requested_lanes"], ["picture_generation"])
        self.assertEqual(intent["text"], body)
        self.assertTrue(intent.get("handoff"))
        self.assertIn("visual_intelligence", intent.get("tags") or [])


class TestVisualIntelligenceHandoffDispatch(unittest.TestCase):
    def test_bus_dispatches_picture_lane_with_evidence(self) -> None:
        body = "Silhouette city skyline at night"
        mock_lane = mock.Mock(spec=PictureGenerationLane)
        mock_lane.lane_id = "picture_generation"
        mock_lane.execute.return_value = {
            "ok": True,
            "lane_id": "picture_generation",
            "action": "make_picture",
            "status": "completed",
            "reason_code": "TASK_BUS_AAIS_IMAGE_PATH",
            "summary": "demo",
        }

        bus = ConstitutionalTaskBus(
            lanes={
                "picture_generation": mock_lane,
            }
        )
        result = bus.dispatch(
            {
                "text": f"{body} {VISUAL_CREATION_COMPLETE_TOKEN}",
                "force_demo": True,
            }
        ).to_dict()

        self.assertTrue(result["ok"])
        self.assertEqual(result["intent"]["kind"], "picture")
        self.assertTrue(
            any(
                e.get("event") == "visual_intelligence_handoff"
                for e in result.get("decision_events") or []
            )
        )
        self.assertGreaterEqual(len(result.get("evidence_refs") or []), 2)
        mock_lane.execute.assert_called_once()
        call_kwargs = mock_lane.execute.call_args.kwargs
        self.assertEqual(call_kwargs["action"], "make_picture")
        self.assertEqual(call_kwargs["payload"]["prompt"], body)
        self.assertNotIn("perfection", call_kwargs["payload"]["prompt"])


if __name__ == "__main__":
    unittest.main()
