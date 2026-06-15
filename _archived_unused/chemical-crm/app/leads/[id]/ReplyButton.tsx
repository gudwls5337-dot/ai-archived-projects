"use client";

import { useState } from "react";

export default function ReplyButton({
  contactId,
  initialHasReplied,
}: {
  contactId: string;
  initialHasReplied: boolean;
}) {
  const [hasReplied, setHasReplied] = useState(initialHasReplied);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    setLoading(true);
    try {
      const res = await fetch(`/api/contacts/${contactId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hasReplied: !hasReplied }),
      });
      if (res.ok) setHasReplied((h) => !h);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className={`rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-50 ${
        hasReplied
          ? "bg-green-100 text-green-700 hover:bg-green-200"
          : "border border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
      }`}
    >
      {hasReplied ? "답장옴 ✓" : "답장 기록"}
    </button>
  );
}
