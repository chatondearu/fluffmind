import type { Component } from 'vue'

import BlockquoteBlock from './components/blocks/BlockquoteBlock.vue'
import CalloutBlock from './components/blocks/CalloutBlock.vue'
import CodeBlock from './components/blocks/CodeBlock.vue'
import DividerBlock from './components/blocks/DividerBlock.vue'
import FallbackBlock from './components/blocks/FallbackBlock.vue'
import HeadingBlock from './components/blocks/HeadingBlock.vue'
import ImageBlock from './components/blocks/ImageBlock.vue'
import ListBlock from './components/blocks/ListBlock.vue'
import MermaidBlock from './components/blocks/MermaidBlock.vue'
import NoteLinkBlock from './components/blocks/NoteLinkBlock.vue'
import ParagraphBlock from './components/blocks/ParagraphBlock.vue'
import TableBlock from './components/blocks/TableBlock.vue'
import TaskListBlock from './components/blocks/TaskListBlock.vue'
import { defineBlock } from './registry'

let registered = false

/** Register built-in block Vue components (#59). */
export function registerDefaultBlocks(): void {
  if (registered) {
    return
  }
  registered = true
  defineBlock({ type: 'paragraph', component: ParagraphBlock as Component })
  defineBlock({ type: 'heading', component: HeadingBlock as Component })
  defineBlock({ type: 'bulletList', component: ListBlock as Component })
  defineBlock({ type: 'orderedList', component: ListBlock as Component })
  defineBlock({ type: 'taskList', component: TaskListBlock as Component })
  defineBlock({ type: 'blockquote', component: BlockquoteBlock as Component })
  defineBlock({ type: 'callout', component: CalloutBlock as Component })
  defineBlock({ type: 'divider', component: DividerBlock as Component })
  defineBlock({ type: 'image', component: ImageBlock as Component })
  defineBlock({ type: 'code', component: CodeBlock as Component })
  defineBlock({ type: 'mermaid', component: MermaidBlock as Component })
  defineBlock({ type: 'table', component: TableBlock as Component })
  defineBlock({ type: 'noteLink', component: NoteLinkBlock as Component })
  defineBlock({ type: 'fallback', component: FallbackBlock as Component })
}
