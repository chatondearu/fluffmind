import type { BlockType } from './types'

export interface SlashCommand {
  type: BlockType
  label: string
  description: string
  keywords: string[]
  /** Heading level when type is `heading`. */
  level?: number
}

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    type: 'paragraph',
    label: 'Texte',
    description: 'Paragraphe simple',
    keywords: ['text', 'texte', 'paragraph', 'p'],
  },
  {
    type: 'heading',
    label: 'Titre 1',
    description: 'Grand titre',
    keywords: ['h1', 'heading1', 'titre1', 'title'],
    level: 1,
  },
  {
    type: 'heading',
    label: 'Titre 2',
    description: 'Sous-titre',
    keywords: ['h2', 'heading2', 'titre2', 'subtitle'],
    level: 2,
  },
  {
    type: 'heading',
    label: 'Titre 3',
    description: 'Section',
    keywords: ['h3', 'heading3', 'titre3'],
    level: 3,
  },
  {
    type: 'bulletList',
    label: 'Liste à puces',
    description: 'Liste non ordonnée',
    keywords: ['bullet', 'list', 'ul', 'liste', 'puces'],
  },
  {
    type: 'orderedList',
    label: 'Liste numérotée',
    description: 'Liste ordonnée',
    keywords: ['numbered', 'ol', 'ordered', 'num'],
  },
  {
    type: 'taskList',
    label: 'Tâche',
    description: 'Case à cocher',
    keywords: ['task', 'todo', 'checkbox', 'tache', 'check'],
  },
  {
    type: 'blockquote',
    label: 'Citation',
    description: 'Bloc citation',
    keywords: ['quote', 'blockquote', 'citation', 'quote'],
  },
  {
    type: 'callout',
    label: 'Callout',
    description: 'Encadré Obsidian',
    keywords: ['callout', 'note', 'tip', 'warning', 'info'],
  },
  {
    type: 'divider',
    label: 'Séparateur',
    description: 'Ligne horizontale',
    keywords: ['divider', 'hr', 'separateur', 'line', '---'],
  },
  {
    type: 'image',
    label: 'Image',
    description: 'Image markdown',
    keywords: ['image', 'img', 'photo', 'picture'],
  },
  {
    type: 'code',
    label: 'Code',
    description: 'Bloc de code',
    keywords: ['code', 'snippet', 'pre'],
  },
  {
    type: 'mermaid',
    label: 'Mermaid',
    description: 'Diagramme Mermaid',
    keywords: ['mermaid', 'diagram', 'flowchart', 'sequence'],
  },
  {
    type: 'table',
    label: 'Tableau',
    description: 'Tableau GFM éditable',
    keywords: ['table', 'tableau', 'grid'],
  },
  {
    type: 'noteLink',
    label: 'Lien note',
    description: 'Lien vers une note du vault',
    keywords: ['link', 'lien', 'note', 'wikilink'],
  },
]

export function filterSlashCommands(query: string): SlashCommand[] {
  const q = query.trim().toLowerCase()
  if (!q) return SLASH_COMMANDS
  return SLASH_COMMANDS.filter((command) => {
    const haystack = [
      command.label,
      command.description,
      ...command.keywords,
      command.type,
    ].join(' ').toLowerCase()
    return haystack.includes(q) || command.keywords.some(k => k.startsWith(q))
  })
}

export function matchSlashQuery(text: string): { active: boolean, query: string } {
  if (!text.startsWith('/')) {
    return { active: false, query: '' }
  }
  return { active: true, query: text.slice(1) }
}
