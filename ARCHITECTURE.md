# Numa AI Architecture - Optimized for Background Audio & Groq

## System Architecture Diagram

```mermaid
graph TB
    subgraph "Mentra Glasses Hardware"
        A[Microphone] -->|Audio Stream| B[Mentra SDK]
        C[Camera] -->|Photo Buffer| B
        D[Speakers] <--|Audio Output| B
        E[Display] <--|Text/UI| B
    end
    
    subgraph "Numa AI Application"
        B --> F[SessionHandler]
        F --> G[AudioSessionManager]
        F --> H[VoiceAssistantUseCase]
        F --> I[VisionAssistantUseCase]
        
        G -->|Speak/Cancel| J[Audio State Machine]
        J -->|IDLE| K[Background Listen]
        J -->|LISTENING| L[Buffer Transcriptions]
        J -->|SPEAKING| M[Interruptible Speech]
        
        H --> N[GroqAIRepository]
        I --> N
        
        N -->|HTTP POST| O[Groq API]
        O -->|Llama 3.3 70B| P[AI Response]
        O -->|LLaVA Vision| Q[Image Analysis]
    end
    
    subgraph "Interaction Flow"
        R[User: "Numa"] -->|Wake Word| F
        S[User: Question] -->|Transcription| L
        T[Stop Command] -->|Priority Interrupt| M
        U[Double Tap] -->|Vision Request| I
    end
```

## Audio State Machine Flow

```mermaid
stateDiagram-v2
    [*] --> IDLE
    
    IDLE --> LISTENING: Wake Word "Numa"
    IDLE --> PROCESSING: Direct Command ("Numa + cmd")
    IDLE --> IDLE: Stop Command
    
    LISTENING --> PROCESSING: Final Transcription
    LISTENING --> IDLE: Stop Command
    LISTENING --> LISTENING: Buffer Transcription
    
    PROCESSING --> IDLE: Complete
    PROCESSING --> IDLE: Stop Command
    PROCESSING --> PROCESSING: Error Recovery
    
    note right of IDLE
        Waiting for wake word
        Background listening ON
    end note
    
    note right of LISTENING
        Active listening mode
        Buffering transcriptions
    end note
    
    note right of PROCESSING
        Executing command
        AI query in progress
    end note
```

## Component Interaction Sequence

```mermaid
sequenceDiagram
    participant U as User
    participant HW as Mentra Hardware
    participant ASM as AudioSessionManager
    participant SH as SessionHandler
    participant VC as VoiceUseCase
    participant GRQ as GroqAIRepository
    participant API as Groq Cloud
    
    U->>HW: Say "Numa"
    HW->>ASM: Transcription received
    ASM->>ASM: Buffer transcription
    ASM->>SH: Wake word detected
    
    SH->>ASM: Transition to LISTENING
    ASM->>HW: Speak "¿Qué necesitas?"
    
    U->>HW: "¿Qué hora es?"
    HW->>ASM: Transcription (final)
    ASM->>SH: Command detected
    
    SH->>SH: State → PROCESSING
    SH->>VC: Execute query
    VC->>GRQ: query("¿Qué hora es?")
    GRQ->>API: POST /chat/completions
    API->>GRQ: AI Response
    GRQ->>VC: Response text
    VC->>SH: Return response
    
    SH->>ASM: Cancel previous speech
    SH->>ASM: Speak response (interruptible)
    ASM->>HW: Speak "Son las 3:30 PM"
    ASM->>SH: State → IDLE
    
    U->>HW: "Detente" (interrupt)
    HW->>SH: Stop command detected
    SH->>ASM: Cancel speech immediately
    ASM->>HW: Stop speaking
    SH->>SH: State → IDLE
```

## Data Flow: Background Audio Listening

```mermaid
flowchart LR
    A[Microphone Input] -->|Real-time| B[Speech-to-Text]
    B -->|Transcription| C{AudioSessionManager}
    
    C -->|isListening?| D{YES: Buffer It}
    C -->|isSpeaking?| E{YES: Queue It}
    C -->|isIdle?| F{NO: Ignore}
    
    D --> G[Transcription Buffer]
    G -->|Auto-flush 5s| H[Process Command]
    
    E --> I[Priority Queue]
    I -->|Stop cmd| J[Interrupt Speech]
    I -->|Other| K[Process Later]
    
    J --> L[Return to LISTENING]
    H --> M[Execute AI Query]
    K --> M
```

## Groq API Integration Architecture

```mermaid
graph LR
    subgraph "Request Pipeline"
        A[VoiceUseCase] -->|query text| B[GroqAIRepository]
        C[VisionUseCase] -->|base64 image| B
        
        B -->|Add Auth Header| D[Fetch with Timeout]
        D -->|30s timeout| E[Groq API Endpoint]
    end
    
    subgraph "Groq Cloud"
        E --> F{Request Type}
        F -->|Text| G[Llama 3.3 70B]
        F -->|Image| H[LLaVA Vision Model]
        
        G -->|Response| I[JSON Response]
        H -->|Response| I
    end
    
    subgraph "Response Handling"
        I --> J[Validate Format]
        J -->|Valid| K[Return to UseCase]
        J -->|Invalid| L[Throw Error]
        L --> M[Error Handler]
        M -->|Show Message| N[User Notification]
    end
```

## Optimization Highlights

### 🎯 Background Audio Optimizations

```
┌──────────────────────────────────────────────┐
│  BEFORE: Sequential Audio Processing         │
│  ┌────────┐  ┌────────┐  ┌────────┐         │
│  │ Listen │→ │Process │→ │ Speak  │         │
│  └────────┘  └────────┘  └────────┘         │
│  ❌ Blocking: Can't listen while speaking    │
└──────────────────────────────────────────────┘

┌──────────────────────────────────────────────┐
│  AFTER: Concurrent Audio with Interruption   │
│  ┌─────────────────────────────────┐        │
│  │   Background Listening (Always) │        │
│  └────────────────┬────────────────┘        │
│                   │                          │
│  ┌────────┐  ┌────▼────┐  ┌────────┐       │
│  │ Buffer │→ │Process  │→ │ Speak  │       │
│  └────────┘  └─────────┘  └──┬─────┘       │
│                               │              │
│                    ┌──────────▼──────────┐  │
│                    │ Interrupt Handler   │  │
│                    │ (Stop Commands)     │  │
│                    └─────────────────────┘  │
│  ✅ Non-blocking: Always listening          │
│  ✅ Interruptible: Stop anytime             │
└──────────────────────────────────────────────┘
```

### ⚡ Groq Performance Benefits

```
┌────────────────────────────────────────────────┐
│  Response Time Comparison                      │
│                                                │
│  Traditional API:  ████████████████ 2-5s      │
│  Groq LPU:         ██ 200-500ms               │
│                                                │
│  10x faster inference with Groq!               │
└────────────────────────────────────────────────┘

┌────────────────────────────────────────────────┐
│  Throughput Comparison                         │
│                                                │
│  Standard GPU:   ████████ 100 tok/s           │
│  Groq LPU:       ████████████████████ 800 tok/s│
│                                                │
│  8x higher throughput!                         │
└────────────────────────────────────────────────┘
```

## Memory & Resource Management

```mermaid
flowchart TB
    subgraph "Resource Lifecycle"
        A[Session Created] --> B[AudioSessionManager.init]
        B --> C[Start Background Listening]
        C --> D[Buffer Timer Started]
        
        D --> E{Session Active?}
        E -->|Yes| F[Buffer Transcriptions]
        E -->|No| G[Dispose Called]
        
        G --> H[Cancel Speech]
        H --> I[Clear Timer]
        I --> J[Clear Buffer]
        J --> K[Set State to IDLE]
        K --> L[Resources Freed]
    end
    
    style A fill:#90EE90
    style L fill:#FFB6C1
    style G fill:#FFD700
```

## Error Recovery Strategy

```mermaid
flowchart TD
    A[API Request] --> B{Success?}
    B -->|Yes| C[Return Response]
    B -->|No| D{Error Type?}
    
    D -->|Timeout| E[Retry with Backoff]
    D -->|Auth Error| F[Show Auth Message]
    D -->|Rate Limit| G[Show Rate Limit Msg]
    D -->|Network Error| H[Show Network Error]
    
    E --> I{Retry Count < 3?}
    I -->|Yes| A
    I -->|No| J[Show Error to User]
    
    C --> K[Speak Response]
    J --> L[Speak Error Message]
    L --> M[Return to IDLE]
    K --> M
    
    style A fill:#87CEEB
    style C fill:#90EE90
    style J fill:#FFB6C1
    style M fill:#FFD700
```

---

**This architecture ensures:**
- ✅ Continuous background listening
- ✅ Instant interruption capability  
- ✅ Ultra-fast Groq API responses
- ✅ Robust error handling
- ✅ Efficient resource management
- ✅ Scalable and maintainable code
