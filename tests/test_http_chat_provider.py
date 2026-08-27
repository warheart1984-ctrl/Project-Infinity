"""Tests for the shared HTTP chat provider adapter."""

import asyncio
import unittest

from src.jarvis_protocol import JarvisMessage
from src.providers.http_chat_provider import HttpChatProvider, HttpChatProviderConfig


class _FakeClient:
    def __init__(self, response):
        self.response = response
        self.calls = []

    def __call__(self, payload, headers):
        self.calls.append((payload, headers))
        return self.response


class TestHttpChatProvider(unittest.TestCase):
    def test_invoke_preserves_multimodal_content_parts(self):
        client = _FakeClient(
            {
                "choices": [{"finish_reason": "stop", "message": {"content": "I see the image."}}],
                "usage": {"prompt_tokens": 10, "completion_tokens": 5},
            }
        )
        provider = HttpChatProvider(
            HttpChatProviderConfig(
                provider_id="nvidia",
                default_model="meta/muse-glimmer-30b",
                endpoint="https://example.invalid/v1/chat/completions",
                api_key="test-key",
            ),
            client=client,
        )
        content = [
            {"type": "text", "text": "What is in this image?"},
            {"type": "image_url", "image_url": {"url": "data:image/png;base64,AA=="}},
        ]
        asyncio.run(provider.invoke([JarvisMessage(role="user", content=content)], max_tokens=64))
        self.assertEqual(client.calls[0][0]["messages"][0]["content"], content)

    def test_invoke_maps_openai_response(self):
        client = _FakeClient(
            {
                "model": "nvidia/nemotron-3-nano-30b-a3b",
                "choices": [
                    {
                        "finish_reason": "stop",
                        "message": {"content": "Nemotron answered."},
                    }
                ],
                "usage": {"prompt_tokens": 10, "completion_tokens": 5},
            }
        )
        provider = HttpChatProvider(
            HttpChatProviderConfig(
                provider_id="nvidia",
                default_model="nvidia/nemotron-3-nano-30b-a3b",
                endpoint="https://integrate.api.nvidia.com/v1/chat/completions",
                api_key="test-key",
                default_extra_body={"chat_template_kwargs": {"enable_thinking": False}},
            ),
            client=client,
        )
        result = asyncio.run(
            provider.invoke([JarvisMessage(role="user", content="Hello")], max_tokens=64)
        )
        self.assertEqual(result.provider, "nvidia")
        self.assertEqual(result.content, "Nemotron answered.")
        self.assertIn("chat_template_kwargs", client.calls[0][0])
