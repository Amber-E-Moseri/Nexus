import { describe, it, expect } from 'vitest'
import {
  buildNovaSystemBlocks,
  formatKbBlock,
  parseKbUsedTrailer,
  isNovaRole,
  NOVA_ROLES,
} from '../src/features/nova/lib/buildSystemPrompt'
import { buildNovaToolDefinitions, NOVA_TOOL_NAMES } from '../src/features/nova/lib/novaTools'

const SAMPLE_ENTRIES = [
  {
    slug: 'tasks-create',
    question: 'How do I create a task?',
    answer: 'Click the blue + button...',
    feature_area: 'tasks',
    applicable_roles: ['member'],
  },
  {
    slug: 'automations-create',
    question: 'How do I create an automation?',
    answer: 'Go to Settings > Automations...',
    feature_area: 'automations',
    applicable_roles: ['dept_lead'],
  },
]

const SAMPLE_ENTRIES_WITH_RELATED = [
  {
    slug: 'sprints-what',
    question: 'What is a sprint?',
    answer: 'A sprint is a focused work period...',
    feature_area: 'sprints',
    applicable_roles: ['member'],
    related_slugs: [],
  },
  {
    slug: 'sprints-create',
    question: 'How do I create a sprint?',
    answer: 'Go to Sprints in the sidebar...',
    feature_area: 'sprints',
    applicable_roles: ['member'],
    related_slugs: [],
  },
  {
    slug: 'sprints-custom-vs-multi-dept',
    question: 'Should I create a custom sprint or a multi-department sprint?',
    answer: 'Both have no department owner...',
    feature_area: 'sprints',
    applicable_roles: ['member'],
    related_slugs: ['sprints-what', 'sprints-create'],
  },
]

describe('isNovaRole', () => {
  it('accepts every canonical role', () => {
    for (const role of NOVA_ROLES) expect(isNovaRole(role)).toBe(true)
  })

  it('rejects unknown or non-string values', () => {
    expect(isNovaRole('group_member')).toBe(false)
    expect(isNovaRole(null)).toBe(false)
    expect(isNovaRole(undefined)).toBe(false)
  })
})

describe('formatKbBlock', () => {
  it('tags each entry with its slug so the model can cite it back', () => {
    const block = formatKbBlock(SAMPLE_ENTRIES)
    expect(block).toContain('[tasks-create]')
    expect(block).toContain('[automations-create]')
  })

  it('includes the full question and answer text, not a truncated summary', () => {
    const block = formatKbBlock(SAMPLE_ENTRIES)
    expect(block).toContain('How do I create a task?')
    expect(block).toContain('Click the blue + button...')
  })

  it('returns a placeholder string for an empty entry list instead of an empty string', () => {
    const block = formatKbBlock([])
    expect(block.length).toBeGreaterThan(0)
    expect(block).toMatch(/no knowledge base entries/i)
  })
})

describe('buildNovaSystemBlocks', () => {
  it('returns a single block carrying an ephemeral cache_control breakpoint', () => {
    const blocks = buildNovaSystemBlocks('member', SAMPLE_ENTRIES)
    expect(blocks).toHaveLength(1)
    expect(blocks[0].cache_control).toEqual({ type: 'ephemeral' })
    expect(blocks[0].type).toBe('text')
  })

  it('embeds the KB content and the read-only/refusal guardrails in the same cached block', () => {
    const blocks = buildNovaSystemBlocks('member', SAMPLE_ENTRIES)
    const text = blocks[0].text
    expect(text).toContain('tasks-create')
    expect(text).toMatch(/read-only/i)
    expect(text).toMatch(/don't know|do not guess/i)
  })

  // Regression coverage for a live-verified issue: a how-to question
  // occasionally triggered a spurious tool call (confirmed via a live
  // Anthropic call, not reproducible on repeat — model non-determinism, not
  // a code bug), which mislabels nova_query_log.track as 'live_data' for
  // what was actually a KB answer. Tightened the guardrail to explicitly
  // discourage speculative tool use; this asserts the instruction is present.
  it('explicitly discourages calling a tool "just in case" on a plain how-to question', () => {
    const blocks = buildNovaSystemBlocks('member', SAMPLE_ENTRIES)
    expect(blocks[0].text).toMatch(/just in case/i)
  })

  it('never inlines a user question into the cached block — that stays out of `system` entirely', () => {
    const blocks = buildNovaSystemBlocks('member', SAMPLE_ENTRIES)
    expect(blocks[0].text).not.toContain('{{question}}')
    // The block is built purely from role + KB entries; it has no per-call
    // input slot for a question at all, which is the actual guarantee here.
    expect(Object.keys(blocks[0])).not.toContain('question')
  })
})

describe('parseKbUsedTrailer', () => {
  it('strips a populated KB_USED trailer and returns the cited slugs', () => {
    const raw = 'Here is how you create a task...\n\nKB_USED: tasks-create,tasks-assign'
    const { text, kbSlugsUsed } = parseKbUsedTrailer(raw)
    expect(text).toBe('Here is how you create a task...')
    expect(kbSlugsUsed).toEqual(['tasks-create', 'tasks-assign'])
  })

  it('treats "KB_USED: none" as no citations, for tool-answered or refusal responses', () => {
    const raw = "I don't know — ask your department lead.\n\nKB_USED: none"
    const { text, kbSlugsUsed } = parseKbUsedTrailer(raw)
    expect(text).toBe("I don't know — ask your department lead.")
    expect(kbSlugsUsed).toEqual([])
  })

  it('returns the original text unchanged when no trailer is present', () => {
    const raw = 'Some answer with no trailer at all.'
    const { text, kbSlugsUsed } = parseKbUsedTrailer(raw)
    expect(text).toBe(raw)
    expect(kbSlugsUsed).toEqual([])
  })

  // Regression coverage for a real leak found during manual verification:
  // an end-anchored strip only works if the model reliably puts the marker
  // exactly last. If it ever emits KB_USED mid-response and keeps talking
  // afterward, an end-anchored regex fails to match at all and the raw tag
  // leaks straight into the user-facing answer — a real defect (an internal
  // control tag showing up in chat), not a cosmetic one.
  it('never leaks the marker even if the model emits it mid-response and continues talking', () => {
    const raw = 'part one\n\nKB_USED: slug1\n\npart two continues here'
    const { text } = parseKbUsedTrailer(raw)
    expect(text).not.toMatch(/KB_USED/i)
    expect(text).toContain('part one')
    expect(text).toContain('part two continues here')
  })

  it('strips the marker regardless of trailing whitespace, punctuation, or case', () => {
    expect(parseKbUsedTrailer('answer\n\nKB_USED: slug1,slug2\n').text).toBe('answer')
    expect(parseKbUsedTrailer('answer\n\nKB_USED: slug1,slug2  ').text).toBe('answer')
    expect(parseKbUsedTrailer('answer\n\nkb_used: slug1').text).toBe('answer')
  })

  it('collapses leftover blank lines after removing the marker so the answer has no dangling whitespace', () => {
    const { text } = parseKbUsedTrailer('answer text\n\nKB_USED: slug1,slug2\n\n')
    expect(text).toBe('answer text')
  })
})

describe('related_slugs support in KB formatting', () => {
  it('emits a RELATED line for entries that have related_slugs', () => {
    const block = formatKbBlock(SAMPLE_ENTRIES_WITH_RELATED)
    expect(block).toContain('RELATED: sprints-what,sprints-create')
  })

  it('does not emit a RELATED line for entries with an empty related_slugs array', () => {
    const block = formatKbBlock(SAMPLE_ENTRIES_WITH_RELATED)
    // sprints-what and sprints-create both have empty related_slugs
    const sprintsWhatSection = block.split('[sprints-what]')[1]?.split('\n\n')[0] ?? ''
    expect(sprintsWhatSection).not.toContain('RELATED:')
  })

  it('does not emit a RELATED line when related_slugs is absent (entries without the field)', () => {
    const block = formatKbBlock(SAMPLE_ENTRIES)
    expect(block).not.toContain('RELATED:')
  })

  it('embeds the RELATED hint inside the cached system block so the model sees it', () => {
    const blocks = buildNovaSystemBlocks('member', SAMPLE_ENTRIES_WITH_RELATED)
    expect(blocks[0].text).toContain('RELATED: sprints-what,sprints-create')
  })

  it('instructs the model to suggest related questions after the main answer', () => {
    const blocks = buildNovaSystemBlocks('member', SAMPLE_ENTRIES_WITH_RELATED)
    // The guardrail should mention related questions / RELATED list behaviour
    expect(blocks[0].text).toMatch(/RELATED/i)
    expect(blocks[0].text).toMatch(/you might also want to know|related.*question|suggest/i)
  })
})

describe('buildNovaToolDefinitions', () => {
  it('defines exactly the tools listed in NOVA_TOOL_NAMES — no more, no less', () => {
    const tools = buildNovaToolDefinitions()
    expect(tools.map((t) => t.name).sort()).toEqual([...NOVA_TOOL_NAMES].sort())
    expect(tools).toHaveLength(NOVA_TOOL_NAMES.length)
  })

  it('caches the tool definitions block via cache_control on the last tool', () => {
    const tools = buildNovaToolDefinitions()
    expect(tools[tools.length - 1].cache_control).toEqual({ type: 'ephemeral' })
  })

  it('gives both tools an empty input_schema — neither takes a target-user or free-form parameter', () => {
    const tools = buildNovaToolDefinitions()
    for (const tool of tools) {
      expect(tool.input_schema.type).toBe('object')
      expect(Object.keys(tool.input_schema.properties)).toHaveLength(0)
    }
  })
})
