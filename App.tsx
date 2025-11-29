import React, { useState, useEffect, useRef } from 'react';
import GameBoard from './components/GameBoard';
import { Player, Card, Phase, TurnPhase, GameState, CardType, RequirementType, Meld, NetworkMessage, NetworkActionPayload } from './types';
import { STANDARD_PHASES, TOTAL_ROUNDS, HAND_SIZE, BOT_NAMES, DEFAULT_TURN_DURATION } from './constants';
import { generatePhases } from './services/geminiService';
import { createDeck, shuffleDeck, dealCards, validatePhaseHand, calculateScore, canAddToMeld } from './utils/gameUtils';

// Helper to access PeerJS since it's loaded via CDN
const getPeer = () => (window as any).Peer;

interface ConnectedClient {
  connection: any;
  peerId: string;
  name: string;
}

const App: React.FC = () => {
  // App State
  const [gameState, setGameState] = useState<GameState>(GameState.LOBBY);
  const [phases, setPhases] = useState<Phase[]>(STANDARD_PHASES);
  const [themeInput, setThemeInput] = useState<string>("");
  const [loadingMessage, setLoadingMessage] = useState<string>("");
  const [notification, setNotification] = useState<string>("");
  
  // Multiplayer UI State
  const [isMultiplayer, setIsMultiplayer] = useState(false);
  const [roomCode, setRoomCode] = useState("");
  const [playerName, setPlayerName] = useState("Player 1");
  const [showRoom, setShowRoom] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [connectedClients, setConnectedClients] = useState<ConnectedClient[]>([]);

  // Refs for Multiplayer
  const peerRef = useRef<any>(null);
  const connectionsRef = useRef<ConnectedClient[]>([]);
  const myPlayerIdRef = useRef<string>('p1');

  // Settings
  const [turnDuration, setTurnDuration] = useState<number>(DEFAULT_TURN_DURATION);
  const [timeLeft, setTimeLeft] = useState<number>(DEFAULT_TURN_DURATION);

  // Game State
  const [players, setPlayers] = useState<Player[]>([]);
  const [deck, setDeck] = useState<Card[]>([]);
  const [discardPile, setDiscardPile] = useState<Card[]>([]);
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState<number>(0);
  const [turnPhase, setTurnPhase] = useState<TurnPhase>(TurnPhase.DRAW);
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
  const [roundWinnerId, setRoundWinnerId] = useState<string | null>(null);

  // Refs for bot delays and timers
  const botTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const notificationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- Multiplayer Setup ---

  const generateRoomCode = () => Math.random().toString(36).substring(2, 7).toUpperCase();

  const createRoom = () => {
     if (!getPeer()) {
         setNotification("PeerJS library not loaded.");
         return;
     }

     const code = generateRoomCode();
     setRoomCode(code);
     setIsHost(true);
     setPlayerName(playerName || "Host");
     myPlayerIdRef.current = 'host';

     const peer = new (getPeer())(`ipr-game-${code}`);
     peerRef.current = peer;

     peer.on('open', (id: string) => {
         setShowRoom(true);
         setNotification(`Room created! Code: ${code}`);
     });

     peer.on('connection', (conn: any) => {
         conn.on('open', () => {
             // Expecting first data to be player name
             conn.on('data', (data: NetworkMessage) => {
                handleNetworkMessage(data, conn);
             });
         });
     });

     peer.on('error', (err: any) => {
         console.error("Peer error:", err);
         setNotification("Connection error: " + err.type);
     });
  };

  const joinRoom = () => {
    if(roomCode.length < 5) {
        setNotification("Please enter a valid 5-character code.");
        return;
    }
    if (!getPeer()) return;
    
    setIsJoining(true);
    setIsHost(false);
    myPlayerIdRef.current = `p-${Date.now()}`;

    const peer = new (getPeer())();
    peerRef.current = peer;

    peer.on('open', () => {
        const conn = peer.connect(`ipr-game-${roomCode}`);
        if (!conn) {
            setIsJoining(false);
            setNotification("Could not create connection.");
            return;
        }

        conn.on('open', () => {
            setIsJoining(false);
            setShowRoom(true);
            setNotification("Connected to room!");
            
            // Send Join Info
            const joinMsg: NetworkMessage = {
                type: 'PLAYER_JOINED',
                payload: { name: playerName, playerId: myPlayerIdRef.current }
            };
            conn.send(joinMsg);

            // Listen for State Updates
            conn.on('data', (data: NetworkMessage) => {
                handleNetworkMessage(data, conn);
            });
        });

        conn.on('error', (err: any) => {
            setIsJoining(false);
            setNotification("Failed to join room. Check code.");
        });
        
        // Save host connection
        connectionsRef.current = [{ connection: conn, peerId: 'host', name: 'Host' }];
    });
  };

  const broadcastState = (overrideState?: any) => {
      if (!isHost) return;
      
      const stateUpdate: NetworkMessage = {
          type: 'STATE_UPDATE',
          payload: {
              players,
              deckCount: deck.length,
              discardPile,
              currentPlayerIndex,
              turnPhase,
              gameState,
              phases,
              roundWinnerId,
              timeLeft,
              ...overrideState
          }
      };

      connectionsRef.current.forEach(c => {
          if(c.connection.open) c.connection.send(stateUpdate);
      });
  };

  // Broadcast state changes if Host
  useEffect(() => {
      if (isHost && gameState !== GameState.LOBBY) {
          broadcastState();
      }
  }, [players, currentPlayerIndex, turnPhase, gameState, discardPile, roundWinnerId, timeLeft]);


  const handleNetworkMessage = (msg: NetworkMessage, conn: any) => {
      if (isHost) {
          // --- HOST HANDLING ---
          if (msg.type === 'PLAYER_JOINED') {
              const newClient: ConnectedClient = {
                  connection: conn,
                  peerId: msg.payload.playerId,
                  name: msg.payload.name
              };
              connectionsRef.current = [...connectionsRef.current, newClient];
              setConnectedClients(prev => [...prev, newClient]);
              
              // Send current Lobby State back immediately
              conn.send({
                  type: 'STATE_UPDATE',
                  payload: {
                      gameState: GameState.LOBBY,
                      roomCode,
                      connectedNames: connectionsRef.current.map(c => c.name)
                  }
              });
          }
          else if (msg.type === 'ACTION') {
              // Execute Action on behalf of client
              const action: NetworkActionPayload = msg.payload;
              processHostAction(action);
          }
      } else {
          // --- CLIENT HANDLING ---
          if (msg.type === 'STATE_UPDATE') {
              const data = msg.payload;
              if (data.gameState) setGameState(data.gameState);
              if (data.players) setPlayers(data.players);
              if (data.deckCount !== undefined) setDeck(Array(data.deckCount).fill({} as Card)); // Dummy deck
              if (data.discardPile) setDiscardPile(data.discardPile);
              if (data.currentPlayerIndex !== undefined) setCurrentPlayerIndex(data.currentPlayerIndex);
              if (data.turnPhase) setTurnPhase(data.turnPhase);
              if (data.phases) setPhases(data.phases);
              if (data.roundWinnerId !== undefined) setRoundWinnerId(data.roundWinnerId);
              if (data.timeLeft !== undefined) setTimeLeft(data.timeLeft);
              if (data.connectedNames && gameState === GameState.LOBBY) {
                  // Just for lobby UI showing who is in
                  setConnectedClients(data.connectedNames.map((n: string) => ({ name: n } as any)));
              }
          }
      }
  };

  const sendClientAction = (action: NetworkActionPayload) => {
      const hostConn = connectionsRef.current[0]?.connection;
      if (hostConn && hostConn.open) {
          hostConn.send({
              type: 'ACTION',
              payload: { ...action, playerId: myPlayerIdRef.current }
          });
      }
  };

  const processHostAction = (action: NetworkActionPayload) => {
      const playerIndex = players.findIndex(p => p.id === action.playerId);
      if (playerIndex === -1) return;
      const player = players[playerIndex];

      // Validate turn
      if (playerIndex !== currentPlayerIndex) return; 

      switch (action.action) {
          case 'DRAW':
              handleDraw(!!action.fromDiscard);
              break;
          case 'DISCARD':
              if (action.cardId) {
                  const card = player.hand.find(c => c.id === action.cardId);
                  if (card) performDiscard(player, card);
              }
              break;
          case 'MELD':
              // Logic reused from handleMeld but bypassing selection state
              if (action.cardIds) {
                const currentPhase = phases[player.phaseIndex];
                const selectedHand = player.hand.filter(c => action.cardIds!.includes(c.id));
                const validation = validatePhaseHand(selectedHand, currentPhase.requirements);
                
                if (validation.valid && validation.groups) {
                    const newHand = player.hand.filter(c => !action.cardIds!.includes(c.id));
                    const newMelds = validation.groups.map((group, idx) => ({
                        id: `meld-${Date.now()}-${idx}`,
                        cards: group,
                        type: currentPhase.requirements[idx].type,
                        ownerId: player.id
                    }));
                    const newPlayers = [...players];
                    newPlayers[playerIndex] = { ...player, hand: newHand, melds: [...player.melds, ...newMelds], hasLaidDownPhase: true };
                    setPlayers(newPlayers);
                }
              }
              break;
          case 'HIT':
              if (action.cardId && action.meldId) {
                  const card = player.hand.find(c => c.id === action.cardId);
                  if (card) executeHit(player, card, action.meldId);
              }
              break;
          case 'REORDER':
               if (action.fromIndex !== undefined && action.toIndex !== undefined) {
                   const newHand = [...player.hand];
                   const [moved] = newHand.splice(action.fromIndex, 1);
                   newHand.splice(action.toIndex, 0, moved);
                   const newPlayers = [...players];
                   newPlayers[playerIndex] = { ...player, hand: newHand };
                   setPlayers(newPlayers);
               }
               break;
      }
  };


  const startGame = async (useAI: boolean) => {
    // Only Host starts game
    if (isMultiplayer && !isHost) return;

    if (useAI && themeInput.trim()) {
      setGameState(GameState.GENERATING);
      setLoadingMessage(`Generating ${themeInput} phases with Gemini AI...`);
      const aiPhases = await generatePhases(themeInput);
      if (aiPhases.length > 0) {
        setPhases(aiPhases);
      } else {
        setNotification("AI failed, using standard phases.");
        setPhases(STANDARD_PHASES);
      }
    } else {
      setPhases(STANDARD_PHASES);
    }

    // Initialize Players
    // Host is always Player 1
    const p1: Player = { 
        id: myPlayerIdRef.current, 
        name: playerName + " (Host)", 
        isHuman: true, 
        hand: [], melds: [], phaseIndex: 0, hasLaidDownPhase: false, score: 0 
    };
    
    let activePlayers: Player[] = [p1];

    if (isMultiplayer) {
        // Add connected clients
        const clientPlayers = connectedClients.map((c, i) => ({
            id: c.peerId,
            name: c.name,
            isHuman: true,
            hand: [], melds: [], phaseIndex: 0, hasLaidDownPhase: false, score: 0
        }));
        activePlayers = [...activePlayers, ...clientPlayers];
    }

    // Fill remaining spots with bots (up to 4 total)
    const neededBots = 4 - activePlayers.length;
    if (neededBots > 0) {
        const shuffledBotNames = [...BOT_NAMES].sort(() => 0.5 - Math.random());
        for(let i=0; i<neededBots; i++) {
            activePlayers.push({
                id: `bot-${i}`,
                name: shuffledBotNames[i],
                isHuman: false,
                hand: [], melds: [], phaseIndex: 0, hasLaidDownPhase: false, score: 0
            });
        }
    }

    setPlayers(activePlayers);
    startRound(activePlayers);
  };

  const startRound = (currentPlayers: Player[]) => {
    const newDeck = shuffleDeck(createDeck());
    const { hands, remainingDeck } = dealCards(newDeck, currentPlayers.length, HAND_SIZE);
    
    // Start Discard Pile
    const firstDiscard = remainingDeck.pop()!;
    
    const updatedPlayers = currentPlayers.map((p, idx) => ({
      ...p,
      hand: hands[idx].sort((a, b) => a.value - b.value),
      melds: [],
      hasLaidDownPhase: false,
      isSkipped: false
    }));

    setDeck(remainingDeck);
    setDiscardPile([firstDiscard]);
    setPlayers(updatedPlayers);
    setCurrentPlayerIndex(0);
    setTurnPhase(TurnPhase.DRAW);
    setRoundWinnerId(null);
    setGameState(GameState.PLAYING);
    setNotification("Round Started! Phase: " + phases[updatedPlayers[0].phaseIndex].name);
    setSelectedCardIds([]);
    setTimeLeft(turnDuration);
    
    // Broadcast initial state
    if (isHost) {
        // We need to wait for state to set, but useEffect handles it generally. 
        // However, initial broadcast is good to force sync
        setTimeout(() => broadcastState({
             gameState: GameState.PLAYING,
             players: updatedPlayers,
             deckCount: remainingDeck.length,
             discardPile: [firstDiscard]
        }), 100);
    }
  };

  // --- Notification Logic ---
  useEffect(() => {
    if (notification) {
        if (notificationTimeoutRef.current) clearTimeout(notificationTimeoutRef.current);
        notificationTimeoutRef.current = setTimeout(() => {
            setNotification("");
        }, 4000); 
    }
    return () => {
        if (notificationTimeoutRef.current) clearTimeout(notificationTimeoutRef.current);
    };
  }, [notification]);

  const dismissNotification = () => {
      setNotification("");
      if (notificationTimeoutRef.current) clearTimeout(notificationTimeoutRef.current);
  };

  const renderNotification = () => (
    notification && (
      <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-4 bg-slate-800 text-white px-6 py-3 rounded-lg shadow-2xl border-l-4 border-indigo-500 animate-in fade-in slide-in-from-top-4 duration-300">
        <span className="font-medium">{notification}</span>
        <button 
            onClick={dismissNotification} 
            className="text-slate-400 hover:text-white font-bold p-1 hover:bg-slate-700 rounded"
        >
            ✕
        </button>
      </div>
    )
  );

  // --- Timer Logic (Host Only) ---

  useEffect(() => {
    // Only Host runs the timer logic
    if ((isHost || !isMultiplayer) && gameState === GameState.PLAYING && turnDuration > 0) {
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) return 0;
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [gameState, turnDuration, isHost, isMultiplayer]);

  // Trigger timeout action when time reaches 0
  useEffect(() => {
    if ((isHost || !isMultiplayer) && gameState === GameState.PLAYING && timeLeft === 0 && turnDuration > 0) {
        handleTimeout();
    }
  }, [timeLeft]);

  const handleTimeout = () => {
    if (gameState !== GameState.PLAYING) return;

    const player = players[currentPlayerIndex];
    
    if (!player.isHuman) {
        // Bot timeout logic is handled in bot loop, but strictly enforcing here
    } else {
        setNotification("Time's up! Auto-playing turn.");
        if (turnPhase === TurnPhase.DRAW) {
            handleDraw(false);
        } else {
            const sortedHand = [...player.hand].sort((a, b) => b.value - a.value);
            let cardToDiscard = sortedHand.find(c => c.type !== CardType.WILD && c.type !== CardType.SKIP);
            if (!cardToDiscard) cardToDiscard = sortedHand[0];
            if (cardToDiscard) performDiscard(player, cardToDiscard);
        }
    }
  };

  // Reset timer on turn/phase change
  useEffect(() => {
    if (isHost || !isMultiplayer) {
        setTimeLeft(turnDuration);
    }
  }, [currentPlayerIndex, turnPhase, turnDuration]);


  // --- Game Loop Interactions ---

  const handleDraw = (fromDiscard: boolean) => {
    // Client Action Check
    if (isMultiplayer && !isHost) {
        sendClientAction({ action: 'DRAW', fromDiscard });
        return;
    }

    const player = players[currentPlayerIndex];
    if (!player.isHuman && timeLeft > 0 && !isMultiplayer) return; 

    let card: Card;
    let newDeck = [...deck];
    let newDiscard = [...discardPile];

    if (fromDiscard) {
      const top = newDiscard[newDiscard.length - 1];
      if (top.type === CardType.SKIP) {
        setNotification("Cannot pick up a Skip card!");
        return;
      }
      card = newDiscard.pop()!;
    } else {
      if (newDeck.length === 0) {
        if (newDiscard.length <= 1) {
             setNotification("Deck empty and no discard to shuffle. Game Draw.");
             return;
        }
        const top = newDiscard.pop()!;
        newDeck = shuffleDeck(newDiscard);
        newDiscard = [top];
      }
      card = newDeck.pop()!;
    }

    const updatedPlayer = { ...player, hand: [...player.hand, card] };
    const newPlayers = [...players];
    newPlayers[currentPlayerIndex] = updatedPlayer;

    setDeck(newDeck);
    setDiscardPile(newDiscard);
    setPlayers(newPlayers);
    setTurnPhase(TurnPhase.ACTION);
  };

  const handleCardClick = (card: Card) => {
    // Local Selection Only
    const p = players[currentPlayerIndex];
    const amIActive = p.id === myPlayerIdRef.current;
    
    // Only allow selection if it's my turn
    if (!amIActive) return;

    if (turnPhase === TurnPhase.ACTION || turnPhase === TurnPhase.DISCARD) {
      if (selectedCardIds.includes(card.id)) {
        setSelectedCardIds(selectedCardIds.filter(id => id !== card.id));
      } else {
        if (turnPhase === TurnPhase.DISCARD) {
          setSelectedCardIds([card.id]);
        } else {
           setSelectedCardIds([...selectedCardIds, card.id]);
        }
      }
    }
  };

  const performDiscard = (player: Player, cardToDiscard: Card) => {
      const newHand = player.hand.filter(c => c.id !== cardToDiscard.id);
      const newDiscard = [...discardPile, cardToDiscard];
      
      const newPlayers = [...players];
      newPlayers[currentPlayerIndex] = { ...player, hand: newHand };
      
      setDiscardPile(newDiscard);
      setPlayers(newPlayers);
      setSelectedCardIds([]);

      // Check Round End
      if (newHand.length === 0) {
        endRound(player.id);
      } else {
        let nextIndex = (currentPlayerIndex + 1) % players.length;
        if (cardToDiscard.type === CardType.SKIP) {
          setNotification(`${players[nextIndex].name} was skipped!`);
          const skippedPlayer = newPlayers[nextIndex];
          skippedPlayer.isSkipped = true;
          nextIndex = (nextIndex + 1) % players.length;
        }

        setCurrentPlayerIndex(nextIndex);
        setTurnPhase(TurnPhase.DRAW);
      }
  };

  const handleDiscard = () => {
    const player = players[currentPlayerIndex];
    
    // Client Action Check
    if (isMultiplayer && !isHost) {
        if (selectedCardIds.length === 1) {
            sendClientAction({ action: 'DISCARD', cardId: selectedCardIds[0] });
            setSelectedCardIds([]); // Clear local selection
        } else {
             setNotification("Select one card.");
        }
        return;
    }

    if (selectedCardIds.length !== 1) {
      if (turnPhase === TurnPhase.ACTION && selectedCardIds.length === 1) {
        // Proceed
      } else {
        setNotification("Select exactly one card to discard.");
        return;
      }
    }

    const cardId = selectedCardIds[0];
    const cardToDiscard = player.hand.find(c => c.id === cardId);

    if (!cardToDiscard) return;
    performDiscard(player, cardToDiscard);
  };

  const handleMeld = () => {
    const player = players[currentPlayerIndex];
    
    // Client Action Check
    if (isMultiplayer && !isHost) {
        sendClientAction({ action: 'MELD', cardIds: selectedCardIds });
        setSelectedCardIds([]);
        return;
    }

    const currentPhase = phases[player.phaseIndex];
    
    if (player.hasLaidDownPhase) {
      setNotification("You have already completed your phase this round.");
      return;
    }

    const selectedHand = player.hand.filter(c => selectedCardIds.includes(c.id));
    const validation = validatePhaseHand(selectedHand, currentPhase.requirements);
    
    if (validation.valid && validation.groups) {
      const newHand = player.hand.filter(c => !selectedCardIds.includes(c.id));
      const newMelds = validation.groups.map((group, idx) => ({
        id: `meld-${Date.now()}-${idx}`,
        cards: group,
        type: currentPhase.requirements[idx].type,
        ownerId: player.id
      }));

      const newPlayers = [...players];
      newPlayers[currentPlayerIndex] = {
        ...player,
        hand: newHand,
        melds: [...player.melds, ...newMelds],
        hasLaidDownPhase: true
      };

      setPlayers(newPlayers);
      setSelectedCardIds([]);
      setNotification("Phase Completed! You can now hit on melds or discard.");
    } else {
      setNotification("Invalid card combination for this phase.");
    }
  };

  const executeHit = (player: Player, card: Card, targetMeldId: string) => {
      let targetMeld: Meld | undefined;
      players.forEach(p => {
          const m = p.melds.find(m => m.id === targetMeldId);
          if (m) targetMeld = m;
      });

      if (!targetMeld) {
          setNotification("Target phase not found.");
          return;
      }

      if (canAddToMeld(card, targetMeld)) {
          const newHand = player.hand.filter(c => c.id !== card.id);
          const newPlayers = players.map(p => {
              let updatedPlayer = { ...p };
              if (p.id === player.id) {
                  updatedPlayer.hand = newHand;
              }
              const meldIndex = p.melds.findIndex(m => m.id === targetMeldId);
              if (meldIndex !== -1) {
                  const newMelds = [...p.melds];
                  const newMeldCards = [...newMelds[meldIndex].cards, card].sort((a,b) => a.value - b.value);
                  newMelds[meldIndex] = { ...newMelds[meldIndex], cards: newMeldCards };
                  updatedPlayer.melds = newMelds;
              }
              return updatedPlayer;
          });

          setPlayers(newPlayers);
          setSelectedCardIds([]);
          setNotification("Card added to phase!");
          if (newHand.length === 0) {
              endRound(player.id);
          }
      } else {
          setNotification("That card doesn't fit in this phase.");
      }
  };

  const handleHitMeld = (targetMeld: Meld) => {
      const player = players[currentPlayerIndex];

      // Client Action Check
      if (isMultiplayer && !isHost) {
          if (selectedCardIds.length === 1) {
              sendClientAction({ action: 'HIT', cardId: selectedCardIds[0], meldId: targetMeld.id });
              setSelectedCardIds([]);
          } else {
              setNotification("Select one card.");
          }
          return;
      }

      if (selectedCardIds.length !== 1) {
          setNotification("Select exactly one card to hit.");
          return;
      }
      
      const cardId = selectedCardIds[0];
      const card = player.hand.find(c => c.id === cardId);
      if (!card) return;
      executeHit(player, card, targetMeld.id);
  };

  const handleMeldDrop = (cardIndex: number, meldId: string) => {
      const player = players[currentPlayerIndex];
      if (cardIndex < 0 || cardIndex >= player.hand.length) return;
      const card = player.hand[cardIndex];

      // Client Action Check
      if (isMultiplayer && !isHost) {
           sendClientAction({ action: 'HIT', cardId: card.id, meldId });
           return;
      }
      
      if (turnPhase !== TurnPhase.ACTION || !player.hasLaidDownPhase) {
          setNotification("You must lay down your phase first before hitting.");
          return;
      }

      executeHit(player, card, meldId);
  };

  const endRound = (winnerId: string) => {
    setRoundWinnerId(winnerId);
    setGameState(GameState.ROUND_OVER);
    
    const updatedPlayers = players.map(p => {
      if (p.id === winnerId) return { ...p, score: p.score };
      return { ...p, score: p.score + calculateScore(p.hand) };
    });

    const finalPlayers = updatedPlayers.map(p => ({
      ...p,
      phaseIndex: p.hasLaidDownPhase ? Math.min(p.phaseIndex + 1, phases.length - 1) : p.phaseIndex
    }));

    setPlayers(finalPlayers);
  };

  const nextRound = () => {
    if (isMultiplayer && !isHost) return; // Only Host advances
    const isGameOver = players.some(p => p.phaseIndex === phases.length - 1 && p.hasLaidDownPhase);
    
    if (isGameOver) {
      setGameState(GameState.GAME_OVER);
    } else {
      startRound(players);
    }
  };

  const sortHand = () => {
    // Sorting is tricky with P2P. We update local logic for finding index, 
    // but actual state is source of truth.
    // For simplicity, we just trigger a state update that reorders the hand in the array.
    const player = players.find(p => p.id === myPlayerIdRef.current);
    if (!player) return;

    // We can't use simple sort locally because state will be overwritten by host sync.
    // We must send reorder command if client.
    
    const sortedHand = [...player.hand].sort((a, b) => {
       if (a.color === b.color) return a.value - b.value;
       return a.color.localeCompare(b.color);
    });

    // We need to map new positions to old positions to send a 'move' command? 
    // Too complex for this simple network protocol.
    // Allow local sort override visual only? No, leads to desync on drag drop.
    // For MVP: Host handles sort logic locally for themselves. Clients loose sort feature unless we implement 'REPLACE_HAND' action.
    // Let's implement local sort just by updating state. If host overwrites, so be it.
    // But better:
    if (isMultiplayer && !isHost) {
        // Not implemented for client in MVP to avoid complexity
        setNotification("Sorting disabled for clients in this version.");
        return;
    }

    // Host/Single Player logic
    const pIdx = players.findIndex(p => p.id === player.id);
    const newPlayers = [...players];
    newPlayers[pIdx] = { ...player, hand: sortedHand };
    setPlayers(newPlayers);
  };

  const handleReorderHand = (fromIndex: number, toIndex: number) => {
    if (isMultiplayer && !isHost) {
        sendClientAction({ action: 'REORDER', fromIndex, toIndex });
        return;
    }

    const newPlayers = [...players];
    const playerIdx = players.findIndex(p => p.id === myPlayerIdRef.current);
    if (playerIdx === -1) return;
    const player = newPlayers[playerIdx];

    const newHand = [...player.hand];
    if (fromIndex < 0 || fromIndex >= newHand.length || toIndex < 0 || toIndex >= newHand.length) return;

    const [movedCard] = newHand.splice(fromIndex, 1);
    newHand.splice(toIndex, 0, movedCard);
    
    newPlayers[playerIdx] = { ...player, hand: newHand };
    setPlayers(newPlayers);
  };

  // --- Bot Logic (Host Only) ---

  useEffect(() => {
    if (gameState !== GameState.PLAYING) return;
    if (isMultiplayer && !isHost) return; // Clients don't run bots

    const player = players[currentPlayerIndex];

    if (!player.isHuman) {
      botTimeoutRef.current = setTimeout(() => {
        botPlayTurn(player);
      }, 1500);
    }

    return () => {
      if (botTimeoutRef.current) clearTimeout(botTimeoutRef.current);
    };
  }, [currentPlayerIndex, gameState, players, isMultiplayer, isHost]);

  const botPlayTurn = (bot: Player) => {
    if (gameState !== GameState.PLAYING) return;

    let currentHand = [...bot.hand];
    let currentDeck = [...deck];
    let currentDiscard = [...discardPile];

    // 1. Draw
    let cardDrawn: Card;
    if (currentDeck.length > 0) {
      cardDrawn = currentDeck.pop()!;
    } else {
      if (currentDiscard.length > 1) {
        const top = currentDiscard.pop()!;
        currentDeck = shuffleDeck(currentDiscard);
        currentDiscard = [top];
        cardDrawn = currentDeck.pop()!;
      } else {
        return;
      }
    }
    currentHand.push(cardDrawn);
    setDeck(currentDeck); 

    // 2. Try Meld
    let hasMeld = false;
    if (!bot.hasLaidDownPhase && currentHand.length >= 6 && Math.random() > 0.85) {
       hasMeld = true;
       const reqCount = phases[bot.phaseIndex].requirements.reduce((a,b) => a + b.count, 0);
       const meldCards = currentHand.slice(0, reqCount);
       currentHand.splice(0, reqCount); 
       
       const botMeld: Meld = {
           id: `bot-meld-${bot.id}-${Date.now()}`,
           cards: meldCards,
           type: RequirementType.SET, 
           ownerId: bot.id
       };
       
       const newPlayers = [...players];
       const botIndex = newPlayers.findIndex(p => p.id === bot.id);
       newPlayers[botIndex] = { ...bot, melds: [...bot.melds, botMeld] };
       setPlayers(newPlayers); 
    }
    
    const botUpdated: Player = {
      ...bot,
      hand: currentHand,
      hasLaidDownPhase: bot.hasLaidDownPhase || hasMeld
    };

    // 3. Discard
    const sortedHand = [...currentHand].sort((a, b) => b.value - a.value);
    const discardCard = sortedHand.find(c => c.type !== CardType.WILD && c.type !== CardType.SKIP) || sortedHand[0];
    
    if (discardCard) {
        performDiscard(botUpdated, discardCard);
    }
  };

  // --- Renders ---

  const myPlayer = players.find(p => p.id === myPlayerIdRef.current) || players[0];
  const opponents = players.filter(p => p.id !== myPlayerIdRef.current);
  const isMyTurn = myPlayer?.id === players[currentPlayerIndex]?.id;

  if (gameState === GameState.LOBBY) {
    if (showRoom) {
       return (
           <div className="flex flex-col items-center justify-center min-h-screen bg-slate-900 text-white p-4">
               {renderNotification()}
               <div className="max-w-md w-full text-center space-y-6">
                   <h2 className="text-3xl font-bold text-indigo-400">Lobby: {roomCode || "Waiting"}</h2>
                   <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 space-y-4">
                       <div className="flex items-center justify-between p-3 bg-slate-700 rounded border border-indigo-500/30">
                           <div className="flex items-center gap-3">
                             <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center font-bold">{playerName.charAt(0)}</div>
                             <span>{playerName} {isHost ? '(Host)' : ''}</span>
                           </div>
                       </div>
                       
                       <div className="text-left text-xs text-slate-400 uppercase font-bold mt-4">Connected Players</div>
                       {connectedClients.length === 0 && <div className="text-sm text-slate-500 italic">Waiting for players to join...</div>}
                       {connectedClients.map((c, i) => (
                           <div key={i} className="flex items-center justify-between p-3 bg-slate-700 rounded">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center font-bold">{c.name.charAt(0)}</div>
                                    <span>{c.name}</span>
                                </div>
                                <span className="text-green-400 text-xs font-bold">READY</span>
                           </div>
                       ))}
                   </div>
                   
                   {isHost ? (
                       <button 
                           onClick={() => startGame(false)}
                           className="w-full py-4 bg-green-600 hover:bg-green-500 rounded-lg font-bold text-lg shadow-lg hover:shadow-green-500/20 transition-all"
                       >
                           Start Game
                       </button>
                   ) : (
                       <div className="text-indigo-300 animate-pulse">Waiting for host to start...</div>
                   )}
                   
                   <button onClick={() => { setShowRoom(false); setIsHost(false); }} className="text-slate-400 hover:text-white underline">
                       Leave Lobby
                   </button>
               </div>
           </div>
       )
    }

    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-900 text-white p-4">
        {renderNotification()}
        <div className="max-w-md w-full space-y-8 text-center">
          <h1 className="text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400">
            Infinite Rummy
          </h1>
          <p className="text-slate-400">Phase 10 inspired, AI Powered.</p>
          
          <div className="bg-slate-800 p-6 rounded-xl shadow-lg border border-slate-700">
            
            <div className="flex rounded bg-slate-900 p-1 mb-6">
                <button 
                    onClick={() => setIsMultiplayer(false)} 
                    className={`flex-1 py-2 rounded text-sm font-bold ${!isMultiplayer ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}
                >
                    Single Player
                </button>
                <button 
                    onClick={() => setIsMultiplayer(true)} 
                    className={`flex-1 py-2 rounded text-sm font-bold ${isMultiplayer ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}
                >
                    Multiplayer
                </button>
            </div>

            {/* Game Settings Area */}
            <div className="mb-6 p-4 bg-slate-700/50 rounded-lg">
                <label className="block text-xs font-bold text-slate-400 uppercase mb-2 text-left">Turn Timer</label>
                <div className="flex gap-2 justify-between">
                    {[15, 30, 60, 0].map(t => (
                        <button
                            key={t}
                            onClick={() => { if(!isMultiplayer || isHost) setTurnDuration(t); }}
                            className={`flex-1 py-1 rounded text-xs font-bold transition-colors ${turnDuration === t ? 'bg-indigo-500 text-white' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'}`}
                        >
                            {t === 0 ? 'None' : `${t}s`}
                        </button>
                    ))}
                </div>
            </div>

            {!isMultiplayer ? (
                // Single Player Options
                <div className="space-y-4 animate-in fade-in duration-300">
                    <button 
                        onClick={() => startGame(false)}
                        className="w-full py-3 bg-slate-700 hover:bg-slate-600 rounded-lg font-bold transition-colors border border-slate-600"
                    >
                        Play Classic
                    </button>
                    
                    <div className="pt-4 border-t border-slate-700">
                        <label className="block text-left text-xs text-indigo-300 mb-2 uppercase font-bold">AI Generated Mode</label>
                        <input 
                        type="text" 
                        placeholder="Enter a theme (e.g. 'Cyberpunk')"
                        className="w-full px-4 py-3 bg-slate-900 border border-slate-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none mb-2"
                        value={themeInput}
                        onChange={(e) => setThemeInput(e.target.value)}
                        />
                        <button 
                        onClick={() => startGame(true)}
                        disabled={!themeInput.trim()}
                        className="w-full py-3 bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500 rounded-lg font-bold transition-all disabled:opacity-50"
                        >
                        Generate & Play
                        </button>
                    </div>
                </div>
            ) : (
                // Multiplayer Options
                <div className="space-y-4 animate-in fade-in duration-300">
                    <input 
                        type="text" 
                        placeholder="Your Name"
                        className="w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg outline-none"
                        value={playerName}
                        onChange={(e) => setPlayerName(e.target.value)}
                    />
                    <div className="grid grid-cols-2 gap-2">
                        <button 
                            onClick={createRoom}
                            className="py-3 bg-indigo-600 hover:bg-indigo-500 rounded-lg font-bold"
                        >
                            Create Room
                        </button>
                        <div className="flex flex-col gap-1">
                            <input 
                                type="text" 
                                placeholder="Code"
                                className="w-full px-2 py-1 bg-slate-900 border border-slate-600 rounded text-center uppercase tracking-widest"
                                value={roomCode}
                                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                                maxLength={5}
                            />
                            <button 
                                onClick={joinRoom}
                                disabled={isJoining}
                                className="py-1 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 rounded font-bold text-sm relative"
                            >
                                {isJoining ? "Connecting..." : "Join"}
                            </button>
                        </div>
                    </div>
                    <div className="text-[10px] text-slate-500 italic">
                        * P2P via PeerJS
                    </div>
                </div>
            )}

          </div>
        </div>
      </div>
    );
  }

  if (gameState === GameState.GENERATING) {
    return (
       <div className="flex flex-col items-center justify-center min-h-screen bg-slate-900 text-white">
         <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-indigo-500 mb-4"></div>
         <h2 className="text-xl font-bold">{loadingMessage}</h2>
       </div>
    );
  }

  if (gameState === GameState.ROUND_OVER || gameState === GameState.GAME_OVER) {
    const sortedPlayers = [...players].sort((a, b) => a.score - b.score);
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-900/90 text-white z-50 fixed inset-0 backdrop-blur-md">
        <div className="bg-slate-800 p-8 rounded-2xl shadow-2xl max-w-lg w-full border border-slate-700">
           <h2 className="text-3xl font-bold text-center mb-6 text-white">
             {gameState === GameState.GAME_OVER ? "Game Over!" : "Round Complete!"}
           </h2>
           
           <div className="space-y-4 mb-8">
             {sortedPlayers.map((p, i) => (
               <div key={p.id} className={`flex justify-between items-center p-3 rounded ${p.id === roundWinnerId ? 'bg-green-900/30 border border-green-500/30' : 'bg-slate-700/30'}`}>
                 <div className="flex items-center gap-3">
                   <span className="font-bold text-slate-400">#{i + 1}</span>
                   <span className="font-semibold">{p.name}</span>
                   {p.id === roundWinnerId && <span className="text-xs text-green-400 font-bold">WINNER</span>}
                 </div>
                 <div className="text-right">
                   <div className="font-mono text-xl">{p.score}</div>
                   <div className="text-xs text-slate-500">Phase {p.phaseIndex + 1}</div>
                 </div>
               </div>
             ))}
           </div>

           {isHost ? (
               <button 
                 onClick={gameState === GameState.GAME_OVER ? () => setGameState(GameState.LOBBY) : nextRound}
                 className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 rounded-xl font-bold text-lg shadow-lg hover:shadow-indigo-500/25 transition-all"
               >
                 {gameState === GameState.GAME_OVER ? "Back to Menu" : "Next Round"}
               </button>
           ) : (
               <div className="text-center text-slate-400 animate-pulse">Waiting for host...</div>
           )}
        </div>
      </div>
    );
  }

  // Guard: Ensure player exists
  if (!myPlayer) return <div>Loading...</div>;

  return (
    <GameBoard 
      currentPlayer={myPlayer}
      opponents={opponents}
      drawPileCount={deck.length}
      discardPileTop={discardPile[discardPile.length - 1] || null}
      currentPhase={phases[myPlayer.phaseIndex]}
      turnPhase={turnPhase}
      selectedCards={selectedCardIds}
      onCardClick={handleCardClick}
      onDrawPileClick={() => handleDraw(false)}
      onDiscardPileClick={() => handleDraw(true)}
      onDiscardAction={handleDiscard}
      onTryMeld={handleMeld}
      onMeldClick={handleHitMeld}
      onMeldDrop={handleMeldDrop}
      message={notification}
      onDismissMessage={dismissNotification}
      onSortHand={sortHand}
      onReorderHand={handleReorderHand}
      isActivePlayer={isMyTurn}
      timeLeft={timeLeft}
      totalTime={turnDuration}
    />
  );
};

export default App;