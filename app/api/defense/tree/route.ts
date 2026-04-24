import { NextRequest, NextResponse } from 'next/server';
import { getDecisionNode } from '@/lib/models/defense-engine';

export const dynamic = 'force-dynamic';

// In-memory store for tree state (resets on server restart; sufficient for single-user desk)
let treeState: { currentNode: string; answers: Record<string, string> } = {
  currentNode: 'root',
  answers: {},
};

export async function GET() {
  const node = getDecisionNode(treeState.currentNode);
  return NextResponse.json({
    success: true,
    data: {
      currentNode: treeState.currentNode,
      answers: treeState.answers,
      node,
    },
  });
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { nextNode, answerLabel } = body as { nextNode: string; answerLabel: string };

    if (nextNode) {
      treeState = {
        currentNode: nextNode,
        answers: {
          ...treeState.answers,
          [treeState.currentNode]: answerLabel ?? '',
        },
      };
    } else {
      // Reset
      treeState = { currentNode: 'root', answers: {} };
    }

    const node = getDecisionNode(treeState.currentNode);
    return NextResponse.json({
      success: true,
      data: { currentNode: treeState.currentNode, answers: treeState.answers, node },
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
