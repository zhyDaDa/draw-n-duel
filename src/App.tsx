import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Space, Tooltip } from 'antd'
import CardLane, { type CardLaneAnimationEvent } from './components/CardLane'
import MerchantModal from './components/MerchantModal'
import PlayerHUD from './components/PlayerHUD'
import TurnLog from './components/TurnLog'
import {
  acceptMerchantOffer,
  createInitialState,
  discardActiveCard,
  drawCard,
  finishPlayerTurn,
  playActiveCard,
  releaseHoldCard,
  skipMerchant,
  stashActiveCard,
  unpackBackpack,
} from './game/engine'
import { MAX_HOLD_SLOTS, type ActionResult, type EngineError, type EngineOutcome, type GameState, type ResolveResult } from './game/types'
import './App.css'

const isEngineError = <T,>(outcome: EngineOutcome<T>): outcome is EngineError =>
  (outcome as EngineError)?.type !== undefined

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>(() => createInitialState())
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [animationEvent, setAnimationEvent] = useState<CardLaneAnimationEvent | null>(null)
  const animationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleOutcome = (outcome: EngineOutcome<ActionResult | ResolveResult>) => {
    if (isEngineError(outcome)) {
      setStatusMessage(outcome.message)
      return
    }
    setGameState(outcome.state)
    setStatusMessage(outcome.messages?.join(' ') ?? null)
  }

  const handleGameStateUpdate = (outcome: EngineOutcome<GameState>) => {
    if (isEngineError(outcome)) {
      setStatusMessage(outcome.message)
      return
    }
    setGameState(outcome)
    setStatusMessage(null)
  }

  const registerAnimation = useCallback((event: CardLaneAnimationEvent) => {
    if (animationTimerRef.current) {
      clearTimeout(animationTimerRef.current)
    }
    setAnimationEvent(event)
    animationTimerRef.current = setTimeout(() => setAnimationEvent(null), 650)
  }, [])

  useEffect(() => () => {
    if (animationTimerRef.current) {
      clearTimeout(animationTimerRef.current)
    }
  }, [])

  const handleDraw = () => {
    const result = drawCard(gameState)
    if (!isEngineError(result) && result.appliedCard) {
      registerAnimation({ type: 'draw', card: result.appliedCard, timestamp: Date.now() })
    }
    handleOutcome(result)
  }

  const handlePlay = () => {
    const activeCard = gameState.activeCard
    const result = playActiveCard(gameState)
    if (!isEngineError(result) && activeCard) {
      registerAnimation({ type: 'play', card: activeCard, timestamp: Date.now() })
    }
    handleOutcome(result)
  }

  const handleStash = () => {
    const activeCard = gameState.activeCard
    const result = stashActiveCard(gameState)
    if (!isEngineError(result) && activeCard) {
      registerAnimation({ type: 'stash', card: activeCard, timestamp: Date.now() })
    }
    handleOutcome(result)
  }

  const handleDiscard = () => {
    const activeCard = gameState.activeCard
    const result = discardActiveCard(gameState)
    if (!isEngineError(result) && activeCard) {
      registerAnimation({ type: 'discard', card: activeCard, timestamp: Date.now() })
    }
    handleOutcome(result)
  }

  const handleReleaseHold = () => {
    const holdCard = gameState.player.holdSlots[0]
    const result = releaseHoldCard(gameState)
    if (!isEngineError(result) && holdCard) {
      registerAnimation({ type: 'release', card: holdCard, timestamp: Date.now() })
    }
    handleOutcome(result)
  }

  const handleUnpack = (index: number) => {
    const result = unpackBackpack(gameState, index)
    handleGameStateUpdate(result)
  }

  const handleEndTurn = () => {
    const nextState = finishPlayerTurn(gameState)
    setGameState(nextState)
    setStatusMessage('进入结算阶段。')
  }

  const handleSkipMerchant = () => {
    const nextState = skipMerchant(gameState)
    setGameState(nextState)
    setStatusMessage('你离开了商人。')
  }

  const handleAcceptMerchant = (index: number) => {
    const result = acceptMerchantOffer(gameState, index)
    handleGameStateUpdate(result)
  }

  const handleReset = () => {
    setGameState(createInitialState())
    setStatusMessage('已重置对决。')
  }

  const isPlayerTurn = gameState.phase === 'playerTurn'
  const holdSlots = gameState.player.holdSlots
  const activeCard = gameState.activeCard
  const canPlay = Boolean(activeCard)
  const canStash = Boolean(activeCard) && holdSlots.length < MAX_HOLD_SLOTS
  const canDiscard = Boolean(activeCard)

  const drawDisabled = !isPlayerTurn || Boolean(activeCard)
  const playDisabled = !isPlayerTurn || !canPlay
  const stashDisabled = !isPlayerTurn || !canStash
  const discardDisabled = !isPlayerTurn || !canDiscard
  const releaseDisabled = !isPlayerTurn || holdSlots.length === 0 || Boolean(activeCard)
  const endTurnDisabled = !isPlayerTurn || Boolean(activeCard)
  const noActionsAvailable =
    isPlayerTurn && drawDisabled && playDisabled && stashDisabled && discardDisabled && releaseDisabled

  const deckStats = useMemo(
    () => `卡堆剩余：${gameState.deck.drawPile.length} 张｜稀有剩余 ${gameState.deck.publicInfo.remainingRare}｜碎片 ${gameState.deck.publicInfo.remainingShards}`,
    [gameState.deck.drawPile.length, gameState.deck.publicInfo.remainingRare, gameState.deck.publicInfo.remainingShards],
  )

  const actionButtons = [
    {
      key: 'draw',
      label: '抽卡',
      onClick: handleDraw,
      disabled: drawDisabled,
      tooltip: '从牌堆抽取一张卡牌，若已有待处理卡则不可抽。',
    },
    {
      key: 'play',
      label: '结算卡牌',
      onClick: handlePlay,
      disabled: playDisabled,
      tooltip: '立即结算这张卡牌的效果。',
    },
    {
      key: 'stash',
      label: '滞留',
      onClick: handleStash,
      disabled: stashDisabled,
      tooltip: '将当前卡牌移动到滞留位。',
    },
    {
      key: 'release',
      label: '释放滞留',
      onClick: handleReleaseHold,
      disabled: releaseDisabled,
      tooltip: '释放滞留位顶部的卡牌并立即结算。',
    },
    {
      key: 'discard',
      label: '丢弃',
      onClick: handleDiscard,
      disabled: discardDisabled,
      tooltip: '放弃这张卡牌并置入弃牌堆。',
    },
  ]

  const endTurnButtonClasses = ['btn', 'btn--accent']
  if (noActionsAvailable) {
    endTurnButtonClasses.push('btn--pulse')
  }

  const matchOutcomeMessage = gameState.phase === 'matchEnd'
    ? gameState.winner === 'Player'
      ? '你赢得了整场对决！'
      : 'AI 获得最终胜利。'
    : null

  return (
    <div id="app-root">
      <header className="top-bar">
        <div className="top-bar__info">
          <Space align="center" size="middle" wrap>
            <div className="top-bar__title">
              <h1>纯粹抽卡决斗</h1>
              <p>层级 {gameState.level}｜阶段：{gameState.phase}</p>
            </div>
            <span className="top-bar__chip top-bar__chip--metric">{deckStats}</span>
            {statusMessage ? <span className="top-bar__chip top-bar__chip--status">{statusMessage}</span> : null}
            {matchOutcomeMessage ? (
              <span className="top-bar__chip top-bar__chip--success">{matchOutcomeMessage}</span>
            ) : null}
          </Space>
        </div>
        <div className="top-bar__actions">
          <button type="button" className="btn btn--ghost" onClick={handleReset}>
            重置对决
          </button>
        </div>
      </header>

  <main className="layout">
        <div className="layout__left">
          <PlayerHUD player={gameState.player} isCurrent={isPlayerTurn} isHuman onUnpackBackpack={handleUnpack} />

          <section className="action-panel">
            <h3>玩家操作</h3>
            <div className="action-panel__buttons">
              {actionButtons.map((action) => {
                const buttonClasses = ['btn']
                if (isPlayerTurn && !action.disabled) {
                  buttonClasses.push('btn--glow')
                }
                return (
                  <div key={action.key} className="action-panel__button">
                    <Tooltip title={action.tooltip} placement="top">
                      <button
                        type="button"
                        className={buttonClasses.join(' ')}
                        onClick={action.onClick}
                        disabled={action.disabled}
                      >
                        {action.label}
                      </button>
                    </Tooltip>
                  </div>
                )
              })}
              <div className="action-panel__button">
                <Tooltip title="当其他操作全部完成后，请结束你的回合。" placement="top">
                  <button type="button" className={endTurnButtonClasses.join(' ')} onClick={handleEndTurn} disabled={endTurnDisabled}>
                    结束回合
                  </button>
                </Tooltip>
              </div>
            </div>

            <CardLane
              deckRemaining={gameState.deck.drawPile.length}
              activeCard={activeCard}
              holdSlots={holdSlots}
              animationEvent={animationEvent}
            />
          </section>
        </div>

        <div className="layout__right">
          <PlayerHUD player={gameState.ai} isCurrent={gameState.phase === 'aiTurn'} isHuman={false} />
          <TurnLog entries={gameState.log} />
        </div>
      </main>
      <MerchantModal
        isOpen={gameState.phase === 'merchant'}
        offers={gameState.merchantOffers}
        onAccept={handleAcceptMerchant}
        onSkip={handleSkipMerchant}
      />
    </div>
  )
}

export default App
