import { Tag, Tooltip } from 'antd'
import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { MERCHANT_EXCLUSIVE } from '../game/cards'
import { CARD_LIBRARY } from '../game/CARD_LIBRARY'
import type { CardDefinition } from '../game/types'

interface TurnLogProps {
  entries: string[]
}

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const allCardDefinitions: CardDefinition[] = [...CARD_LIBRARY, ...MERCHANT_EXCLUSIVE]
const cardLookupByName = new Map<string, CardDefinition>(
  allCardDefinitions.map((definition) => [definition.C_name, definition]),
)
const cardNamePattern = allCardDefinitions
  .map((definition) => definition.C_name)
  .sort((a, b) => b.length - a.length)
  .map(escapeRegExp)
  .join('|')
const cardNameRegex = cardNamePattern ? new RegExp(`(${cardNamePattern})`, 'g') : null

const rarityLabels: Record<CardDefinition['C_rarity'], string> = {
  1: '阶 1',
  2: '阶 2',
  3: '阶 3',
  4: '阶 4',
  5: '阶 5',
  common: '普通',
  uncommon: '罕见',
  rare: '稀有',
  legendary: '传说',
  mythic: '神话',
}

const rarityColorMap: Record<string, string> = {
  // numeric tiers map to neutral / slate
  '1': '#475569',
  '2': '#475569',
  '3': '#475569',
  '4': '#475569',
  '5': '#475569',
  common: '#6b7280',
  uncommon: '#047857',
  rare: '#4338ca',
  legendary: '#f59e0b',
  mythic: '#8b5cf6',
}

const renderCardBadge = (name: string, uniqueKey: string): ReactNode => {
  const definition = cardLookupByName.get(name)
  if (!definition) return name

  const tooltipContent = (
    <div className="log-card__tooltip tooltip-light__panel">
      <header>
        <strong>{definition.C_name}</strong>
        <span>{rarityLabels[definition.C_rarity]}</span>
      </header>
      <p>{definition.C_description}</p>
    </div>
  )

  const colorKey = typeof definition.C_rarity === 'number' ? String(definition.C_rarity) : definition.C_rarity
  const tagColor = rarityColorMap[String(colorKey)]

  return (
    <Tooltip key={uniqueKey} title={tooltipContent} placement="top" overlayClassName="tooltip-light">
      <Tag className="turn-log__card-ref" bordered color={tagColor ?? undefined}>{definition.C_name}</Tag>
    </Tooltip>
  )
}

const renderLogEntry = (entry: string, globalIndex: number): ReactNode => {
  if (!cardNameRegex) {
    return <span key={`${globalIndex}-plain`}>{entry}</span>
  }

  const parts = entry.split(cardNameRegex).filter((segment) => segment && segment.length > 0)

  return parts.map((segment, index) => {
    if (cardLookupByName.has(segment)) {
      const key = `${globalIndex}-card-${segment}-${index}`
      return <span key={key}>{renderCardBadge(segment, key)}</span>
    }
    return <span key={`${globalIndex}-text-${index}`}>{segment}</span>
  })
}

export const TurnLog: React.FC<TurnLogProps> = ({ entries }) => {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const total = entries.length

  useEffect(() => {
    const container = scrollRef.current
    if (!container) return
    container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' })
  }, [entries])

  return (
    <section className="turn-log">
      <h3>事件日志</h3>
      <div className="turn-log__scroll" ref={scrollRef}>
        {total === 0 ? (
          <p>暂无日志。</p>
        ) : (
          <ol>
            {entries.map((entry, index) => {
              const isLatest = index === total - 1
              return (
                <li key={`${index}-${entry.slice(0, 12)}`} className={`turn-log__item ${isLatest ? 'turn-log__item--latest' : ''}`.trim()}>
                  {renderLogEntry(entry, index)}
                </li>
              )
            })}
          </ol>
        )}
      </div>
    </section>
  )
}

export default TurnLog
