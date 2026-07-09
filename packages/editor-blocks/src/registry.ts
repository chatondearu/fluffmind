import type { Component } from 'vue'

import type { BlockType } from './types'

export interface BlockDefinition {
  type: BlockType
  component: Component
}

const registry = new Map<BlockType, BlockDefinition>()

/** Register a Vue block component for a block type (#56). */
export function defineBlock(definition: BlockDefinition): BlockDefinition {
  registry.set(definition.type, definition)
  return definition
}

export function getBlockDefinition(type: BlockType): BlockDefinition | undefined {
  return registry.get(type)
}

export function getRegisteredBlockTypes(): BlockType[] {
  return [...registry.keys()]
}

export function clearBlockRegistry(): void {
  registry.clear()
}
