import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Square, Minus, ArrowRight, Type, Eraser, Copy, Trash2, Info, Download, ImagePlus, Loader2, Settings, X, Sparkles, Send, Bot, Paperclip, XCircle, Moon, Sun } from 'lucide-react';
import { GoogleGenAI } from '@google/genai';

type Tool = 'box' | 'line' | 'arrow' | 'text' | 'eraser';

const COLS = 120;
const ROWS = 60;
const FONT_SIZE = 16;
const FONT_FAMILY = '"JetBrains Mono", "Courier New", Courier, monospace';

const PROVIDER_CONFIGS = {
  gemini: { name: 'Google Gemini', model: 'gemini-3.1-pro-preview', baseURL: '' },
  openai: { name: 'OpenAI', model: 'gpt-4o', baseURL: 'https://api.openai.com/v1' },
  zhipu: { name: '智谱 (Zhipu)', model: 'glm-4v-plus', baseURL: 'https://open.bigmodel.cn/api/paas/v4' },
  stepfun: { name: '阶跃星辰 (StepFun)', model: 'step-1v-32k', baseURL: 'https://api.stepfun.com/v1' },
  minimax: { name: 'MiniMax-M2.5', model: 'MiniMax-M2.5', baseURL: 'https://api.minimaxi.com/v1' },
  moonshot: { name: 'Kimi 2.5 (Moonshot)', model: 'moonshot-v1-8k-vision-preview', baseURL: 'https://api.moonshot.cn/v1' },
  custom: { name: 'Custom (OpenAI Compatible)', model: '', baseURL: '' }
};

type ProviderKey = keyof typeof PROVIDER_CONFIGS;

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tool, setTool] = useState<Tool>('box');
  const [isDrawing, setIsDrawing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState<{role: 'user'|'assistant', content: string, image?: { base64: string; mimeType: string }}[]>([]);
  const [pendingImage, setPendingImage] = useState<{ base64: string; mimeType: string } | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const chatFileInputRef = useRef<HTMLInputElement>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('asc2_theme');
    return (saved as 'dark' | 'light') || 'dark';
  });
  
  const [apiConfig, setApiConfig] = useState(() => {
    const saved = localStorage.getItem('asc2_api_config');
    return saved ? JSON.parse(saved) : {
      provider: 'gemini' as ProviderKey,
      apiKey: '',
      baseURL: '',
      modelName: 'gemini-3.1-pro-preview'
    };
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const gridRef = useRef<string[][]>(Array.from({ length: ROWS }, () => Array(COLS).fill(' ')));
  const previewRef = useRef<string[][] | null>(null);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);
  const textCursorRef = useRef<{ x: number; y: number } | null>(null);
  
  const cellMetrics = useRef({ width: 9.6, height: 19.2 });

  useEffect(() => {
    localStorage.setItem('asc2_api_config', JSON.stringify(apiConfig));
  }, [apiConfig]);

  useEffect(() => {
    localStorage.setItem('asc2_theme', theme);
    if (theme === 'light') {
      document.documentElement.classList.add('light');
    } else {
      document.documentElement.classList.remove('light');
    }
  }, [theme]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  }, []);

  const draw = useCallback((cursorVisible = true) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    
    ctx.font = `${FONT_SIZE}px ${FONT_FAMILY}`;
    ctx.textBaseline = 'top';
    
    const grid = gridRef.current;
    const preview = previewRef.current;
    const { width: cw, height: ch } = cellMetrics.current;

    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const isPreview = preview && preview[y][x] !== ' ';
        const char = isPreview ? preview[y][x] : grid[y][x];
        
        if (char !== ' ') {
          ctx.fillStyle = isPreview ? '#10b981' : (theme === 'light' ? '#1f2937' : '#e5e7eb');
          ctx.fillText(char, x * cw, y * ch);
        }
      }
    }
    
    if (tool === 'text' && textCursorRef.current && cursorVisible) {
      const { x, y } = textCursorRef.current;
      ctx.fillStyle = '#10b981';
      ctx.fillRect(x * cw, y * ch + ch - 2, cw, 2);
    }
  }, [tool]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.font = `${FONT_SIZE}px ${FONT_FAMILY}`;
    const metrics = ctx.measureText('M');
    cellMetrics.current.width = metrics.width;
    cellMetrics.current.height = FONT_SIZE * 1.2;

    const dpr = window.devicePixelRatio || 1;
    const logicalWidth = COLS * cellMetrics.current.width;
    const logicalHeight = ROWS * cellMetrics.current.height;

    canvas.width = logicalWidth * dpr;
    canvas.height = logicalHeight * dpr;
    canvas.style.width = `${logicalWidth}px`;
    canvas.style.height = `${logicalHeight}px`;

    ctx.scale(dpr, dpr);
    
    draw();
  }, [draw]);

  useEffect(() => {
    if (tool !== 'text') {
      if (textCursorRef.current) {
        textCursorRef.current = null;
        draw(false);
      }
      return;
    }

    let animationFrame: number;
    let lastToggle = 0;
    let cursorVisible = true;

    const renderLoop = (time: number) => {
      if (textCursorRef.current) {
        if (time - lastToggle > 500) {
          cursorVisible = !cursorVisible;
          lastToggle = time;
          draw(cursorVisible);
        }
      }
      animationFrame = requestAnimationFrame(renderLoop);
    };
    
    animationFrame = requestAnimationFrame(renderLoop);
    return () => cancelAnimationFrame(animationFrame);
  }, [tool, draw]);

  const getCanvasText = useCallback(() => {
    const grid = gridRef.current;
    let minX = COLS, maxX = 0, minY = ROWS, maxY = 0;
    let hasContent = false;
    
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (grid[y][x] !== ' ') {
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
          hasContent = true;
        }
      }
    }
    
    if (!hasContent) {
      showToast('Canvas is empty');
      return null;
    }
    
    let text = '';
    for (let y = minY; y <= maxY; y++) {
      let row = '';
      for (let x = minX; x <= maxX; x++) {
        row += grid[y][x];
      }
      text += row.replace(/\s+$/, '') + '\n';
    }
    
    return text;
  }, [showToast]);

  const handleCopy = useCallback(() => {
    const text = getCanvasText();
    if (!text) {
      navigator.clipboard.writeText('');
      return;
    }
    
    navigator.clipboard.writeText(text);
    showToast('Copied to clipboard!');
  }, [getCanvasText, showToast]);

  const handleExport = useCallback(() => {
    const text = getCanvasText();
    if (!text) return;
    
    const markdownContent = `# ASC2 Flow Diagram\n\nGenerated on ${new Date().toLocaleString()}\n\n\`\`\`text\n${text}\`\`\`\n`;
    
    const blob = new Blob([markdownContent], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `asc2-flow-${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showToast('Saved as Markdown!');
  }, [getCanvasText, showToast]);

  const handleImportImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!apiConfig.apiKey) {
      showToast('Please configure your API Key in Settings first!');
      setIsSettingsOpen(true);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    if (apiConfig.provider === 'minimax') {
      showToast('MiniMax currently does not support image input. Please select another provider.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setIsImporting(true);
    showToast(`Analyzing image with ${PROVIDER_CONFIGS[apiConfig.provider as ProviderKey].name}...`);

    try {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      
      reader.onload = async () => {
        try {
          const base64Data = (reader.result as string).split(',')[1];
          const mimeType = file.type;
          const promptText = 'Convert this image (which is either a screenshot of an ASCII diagram or a hand-drawn flowchart) into a clean ASCII art flowchart. Use ONLY the following characters for shapes and lines: "+", "-", "|", "<", ">", "^", "v". You can use alphanumeric characters for text labels. Do NOT wrap the output in markdown code blocks (no ```). Return ONLY the raw ASCII text. Ensure it fits within a 120 columns by 60 rows grid. Maintain the relative spatial layout of the original image.';

          let asciiText = '';

          if (apiConfig.provider === 'gemini') {
            const ai = new GoogleGenAI({ apiKey: apiConfig.apiKey });
            const response = await ai.models.generateContent({
              model: apiConfig.modelName || 'gemini-3.1-pro-preview',
              contents: {
                parts: [
                  { inlineData: { data: base64Data, mimeType: mimeType } },
                  { text: promptText },
                ],
              },
            });
            asciiText = response.text || '';
          } else {
            // OpenAI Compatible API Call
            const response = await fetch(`${apiConfig.baseURL}/chat/completions`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiConfig.apiKey}`
              },
              body: JSON.stringify({
                model: apiConfig.modelName,
                temperature: 1.0,
                messages: [
                  {
                    role: 'user',
                    content: [
                      { type: 'text', text: promptText },
                      { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Data}` } }
                    ]
                  }
                ],
                max_tokens: 4096
              })
            });

            if (!response.ok) {
              const errData = await response.json().catch(() => ({}));
              throw new Error(errData.error?.message || `HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            asciiText = data.choices[0]?.message?.content || '';
          }

          asciiText = asciiText.replace(/<think>[\s\S]*?<\/think>/gi, '');
          const lines = asciiText.replace(/```[a-z]*\n?/g, '').replace(/```/g, '').split('\n');
          const newGrid = Array.from({ length: ROWS }, () => Array(COLS).fill(' '));
          
          for (let y = 0; y < Math.min(lines.length, ROWS); y++) {
            const line = lines[y];
            for (let x = 0; x < Math.min(line.length, COLS); x++) {
              newGrid[y][x] = line[x] || ' ';
            }
          }
          
          gridRef.current = newGrid;
          draw();
          showToast('Import successful!');
        } catch (error: any) {
          console.error('Error converting image:', error);
          showToast(`API Error: ${error.message || 'Failed to convert image'}`);
        } finally {
          setIsImporting(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }
      };
    } catch (error) {
      console.error('Error reading file:', error);
      showToast('Failed to read file.');
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleChatImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (apiConfig.provider === 'minimax') {
      showToast('MiniMax currently does not support image input. Please select another provider.');
      if (chatFileInputRef.current) chatFileInputRef.current.value = '';
      return;
    }

    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      setPendingImage({ base64, mimeType: file.type });
      if (chatFileInputRef.current) chatFileInputRef.current.value = '';
    };
  };

  const handleSendMessage = async () => {
    if (!chatInput.trim() && !pendingImage) return;
    if (!apiConfig.apiKey) {
      showToast('Please configure your API Key in Settings first!');
      setIsSettingsOpen(true);
      return;
    }

    const userMsg = chatInput.trim();
    const currentImage = pendingImage;
    setChatInput('');
    setPendingImage(null);
    setMessages(prev => [...prev, { role: 'user', content: userMsg, image: currentImage }]);
    setIsGenerating(true);

    const SYSTEM_PROMPT = 'You are an expert software architect. Generate an ASCII art flowchart based on the user\'s request. Use ONLY the following characters for shapes and lines: "+", "-", "|", "<", ">", "^", "v". Use alphanumeric characters for text labels. Do NOT wrap the output in markdown code blocks (no ```). Return ONLY the raw ASCII text. Ensure it fits within a 120 columns by 60 rows grid.';

    // Memory Management: Optimize history to save tokens
    // 1. Keep only the last 6 messages
    // 2. Truncate assistant messages to avoid sending huge ASCII blocks back
    const recentMessages = messages.slice(-6).map(m => ({
      ...m,
      content: m.role === 'assistant' ? '[Diagram generated and applied to canvas]' : m.content
    }));

    // 3. Inject current canvas state into the latest prompt so the model knows what to modify
    const currentCanvas = getCanvasText();
    let finalPrompt = userMsg || 'Please convert this image to an ASCII diagram.';
    if (currentCanvas && currentCanvas.trim().length > 0 && !currentImage) {
      finalPrompt = `Current Canvas State:\n\`\`\`text\n${currentCanvas}\n\`\`\`\n\nUser Request: ${finalPrompt}\n\nPlease output the complete updated ASCII diagram based on the current state.`;
    }

    try {
      let asciiText = '';
      
      if (apiConfig.provider === 'gemini') {
        const ai = new GoogleGenAI({ apiKey: apiConfig.apiKey });
        const history = recentMessages.map(m => {
          const parts: any[] = [{ text: m.content }];
          if (m.image) {
            parts.push({ inlineData: { data: m.image.base64, mimeType: m.image.mimeType } });
          }
          return { role: m.role === 'assistant' ? 'model' : 'user', parts };
        });
        
        const latestParts: any[] = [{ text: finalPrompt }];
        if (currentImage) {
          latestParts.push({ inlineData: { data: currentImage.base64, mimeType: currentImage.mimeType } });
        }

        const response = await ai.models.generateContent({
          model: apiConfig.modelName || 'gemini-3.1-pro-preview',
          contents: [...history, { role: 'user', parts: latestParts }],
          config: {
            systemInstruction: SYSTEM_PROMPT,
          }
        });
        asciiText = response.text || '';
      } else {
        const history = recentMessages.map(m => {
          if (m.image) {
            return {
              role: m.role,
              content: [
                { type: 'text', text: m.content },
                { type: 'image_url', image_url: { url: `data:${m.image.mimeType};base64,${m.image.base64}` } }
              ]
            };
          }
          return { role: m.role, content: m.content };
        });

        const latestContent: any[] = [{ type: 'text', text: finalPrompt }];
        if (currentImage) {
          latestContent.push({ type: 'image_url', image_url: { url: `data:${currentImage.mimeType};base64,${currentImage.base64}` } });
        }

        const response = await fetch(`${apiConfig.baseURL}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiConfig.apiKey}`
          },
          body: JSON.stringify({
            model: apiConfig.modelName,
            temperature: 1.0,
            messages: [
              { role: 'system', content: SYSTEM_PROMPT },
              ...history,
              { role: 'user', content: latestContent }
            ],
            max_tokens: 4096
          })
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error?.message || `HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        asciiText = data.choices[0]?.message?.content || '';
      }

      asciiText = asciiText.replace(/<think>[\s\S]*?<\/think>/gi, '');
      const lines = asciiText.replace(/```[a-z]*\n?/g, '').replace(/```/g, '').split('\n');
      const newGrid = Array.from({ length: ROWS }, () => Array(COLS).fill(' '));
      
      for (let y = 0; y < Math.min(lines.length, ROWS); y++) {
        const line = lines[y];
        for (let x = 0; x < Math.min(line.length, COLS); x++) {
          newGrid[y][x] = line[x] || ' ';
        }
      }
      
      gridRef.current = newGrid;
      draw();
      setMessages(prev => [...prev, { role: 'assistant', content: 'Diagram generated and applied to canvas!' }]);
      showToast('Diagram generated!');
    } catch (error: any) {
      console.error('Generation error:', error);
      showToast(`API Error: ${error.message || 'Failed to generate diagram'}`);
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${error.message}` }]);
    } finally {
      setIsGenerating(false);
    }
  };

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (isSettingsOpen || document.activeElement?.tagName === 'INPUT') return; // Don't paste to canvas if typing in settings or chat
      
      const text = e.clipboardData?.getData('text/plain');
      if (!text) return;
      
      const lines = text.split(/\r?\n/);
      const grid = gridRef.current;
      
      let startX = 0;
      let startY = 0;
      if (tool === 'text' && textCursorRef.current) {
        startX = textCursorRef.current.x;
        startY = textCursorRef.current.y;
      }
      
      for (let i = 0; i < lines.length; i++) {
        const y = startY + i;
        if (y >= ROWS) break;
        
        const line = lines[i];
        for (let j = 0; j < line.length; j++) {
          const x = startX + j;
          if (x >= COLS) break;
          
          if (!/[\x00-\x1F\x7F]/.test(line[j])) {
            grid[y][x] = line[j];
          }
        }
      }
      
      if (tool === 'text' && textCursorRef.current) {
        if (lines.length === 1) {
          textCursorRef.current.x = Math.min(COLS - 1, startX + lines[0].length);
        } else {
          textCursorRef.current.y = Math.min(ROWS - 1, startY + lines.length - 1);
          textCursorRef.current.x = Math.min(COLS - 1, startX + lines[lines.length - 1].length);
        }
      }
      
      draw();
      showToast('Pasted from clipboard!');
    };
    
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [tool, draw, showToast, isSettingsOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isSettingsOpen || document.activeElement?.tagName === 'INPUT') return; // Disable canvas shortcuts when typing

      if (tool === 'text') {
        if (e.key === 'Escape') {
          setTool('box');
          textCursorRef.current = null;
          draw();
          return;
        }
        
        if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
          handleCopy();
          return;
        }
        
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
          e.preventDefault();
          handleExport();
          return;
        }

        if (!textCursorRef.current) return;
        
        const pos = textCursorRef.current;
        const grid = gridRef.current;
        
        if (['Backspace', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(e.key)) {
          e.preventDefault();
        }
        
        if (e.key === 'Backspace') {
          if (pos.x > 0) {
            pos.x -= 1;
            grid[pos.y][pos.x] = ' ';
          }
        } else if (e.key === 'Enter') {
          pos.y = Math.min(ROWS - 1, pos.y + 1);
        } else if (e.key === 'ArrowLeft') {
          pos.x = Math.max(0, pos.x - 1);
        } else if (e.key === 'ArrowRight') {
          pos.x = Math.min(COLS - 1, pos.x + 1);
        } else if (e.key === 'ArrowUp') {
          pos.y = Math.max(0, pos.y - 1);
        } else if (e.key === 'ArrowDown') {
          pos.y = Math.min(ROWS - 1, pos.y + 1);
        } else if (e.key.length === 1) {
          grid[pos.y][pos.x] = e.key;
          pos.x = Math.min(COLS - 1, pos.x + 1);
        }
        
        draw();
        return;
      }
      
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        handleCopy();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleExport();
        return;
      }

      switch (e.key.toLowerCase()) {
        case 'b': setTool('box'); break;
        case 'l': setTool('line'); break;
        case 'a': setTool('arrow'); break;
        case 't': setTool('text'); break;
        case 'e': setTool('eraser'); break;
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [tool, draw, handleCopy, handleExport, isSettingsOpen]);

  const getGridPos = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((clientX - rect.left) / cellMetrics.current.width);
    const y = Math.floor((clientY - rect.top) / cellMetrics.current.height);
    return { 
      x: Math.max(0, Math.min(x, COLS - 1)), 
      y: Math.max(0, Math.min(y, ROWS - 1)) 
    };
  };

  const handlePointerDown = (clientX: number, clientY: number) => {
    const pos = getGridPos(clientX, clientY);
    
    if (tool === 'text') {
      textCursorRef.current = pos;
      draw();
      return;
    }
    
    setIsDrawing(true);
    startPosRef.current = pos;
    textCursorRef.current = null;
    
    if (tool === 'eraser') {
      gridRef.current[pos.y][pos.x] = ' ';
      draw();
    }
  };

  const handlePointerMove = (clientX: number, clientY: number) => {
    if (!isDrawing || !startPosRef.current) return;
    
    const pos = getGridPos(clientX, clientY);
    const start = startPosRef.current;
    
    if (tool === 'eraser') {
      gridRef.current[pos.y][pos.x] = ' ';
      draw();
      return;
    }
    
    const preview = Array.from({ length: ROWS }, () => Array(COLS).fill(' '));
    
    if (tool === 'box') {
      const minX = Math.min(start.x, pos.x);
      const maxX = Math.max(start.x, pos.x);
      const minY = Math.min(start.y, pos.y);
      const maxY = Math.max(start.y, pos.y);
      
      if (maxX > minX && maxY > minY) {
        for (let x = minX; x <= maxX; x++) {
          preview[minY][x] = '-';
          preview[maxY][x] = '-';
        }
        for (let y = minY; y <= maxY; y++) {
          preview[y][minX] = '|';
          preview[y][maxX] = '|';
        }
        preview[minY][minX] = '+';
        preview[minY][maxX] = '+';
        preview[maxY][minX] = '+';
        preview[maxY][maxX] = '+';
      }
    } else if (tool === 'line' || tool === 'arrow') {
      const dx = Math.abs(pos.x - start.x);
      const dy = Math.abs(pos.y - start.y);
      
      if (dx > dy) {
        const minX = Math.min(start.x, pos.x);
        const maxX = Math.max(start.x, pos.x);
        for (let x = minX; x <= maxX; x++) {
          preview[start.y][x] = '-';
        }
        if (tool === 'arrow' && maxX > minX) {
          preview[start.y][pos.x] = pos.x > start.x ? '>' : '<';
        }
      } else {
        const minY = Math.min(start.y, pos.y);
        const maxY = Math.max(start.y, pos.y);
        for (let y = minY; y <= Math.max(minY, maxY); y++) {
          preview[y][start.x] = '|';
        }
        if (tool === 'arrow' && maxY > minY) {
          preview[pos.y][start.x] = pos.y > start.y ? 'v' : '^';
        }
      }
    }
    
    previewRef.current = preview;
    draw();
  };

  const handlePointerUp = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    
    if (previewRef.current) {
      const grid = gridRef.current;
      const preview = previewRef.current;
      
      for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
          if (preview[y][x] !== ' ') {
            const char = preview[y][x];
            const current = grid[y][x];
            if ((char === '-' && current === '|') || (char === '|' && current === '-')) {
              grid[y][x] = '+';
            } else {
              grid[y][x] = char;
            }
          }
        }
      }
      previewRef.current = null;
    }
    
    draw();
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => handlePointerDown(e.clientX, e.clientY);
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => handlePointerMove(e.clientX, e.clientY);
  const handleMouseUp = () => handlePointerUp();
  
  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    const touch = e.touches[0];
    if (touch) handlePointerDown(touch.clientX, touch.clientY);
  };
  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    const touch = e.touches[0];
    if (touch) handlePointerMove(touch.clientX, touch.clientY);
  };
  const handleTouchEnd = () => handlePointerUp();

  const handleClear = () => {
    if (confirm('Are you sure you want to clear the canvas?')) {
      gridRef.current = Array.from({ length: ROWS }, () => Array(COLS).fill(' '));
      textCursorRef.current = null;
      draw();
    }
  };

  const handleProviderChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const provider = e.target.value as ProviderKey;
    setApiConfig({
      ...apiConfig,
      provider,
      baseURL: PROVIDER_CONFIGS[provider].baseURL,
      modelName: PROVIDER_CONFIGS[provider].model
    });
  };

  return (
    <div className={`min-h-screen flex flex-col font-sans selection:bg-emerald-500/30 ${theme === 'light' ? 'bg-zinc-50 text-zinc-900' : 'bg-zinc-950 text-zinc-300'}`}>
      {toast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 bg-emerald-500 text-zinc-950 px-6 py-2 rounded-full font-medium text-sm shadow-lg shadow-emerald-500/20 transition-all animate-in fade-in slide-in-from-top-4">
          {toast}
        </div>
      )}

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className={`${theme === 'light' ? 'bg-white border-zinc-200' : 'bg-zinc-900 border-zinc-800'} border rounded-2xl p-6 w-full max-w-md shadow-2xl`}>
            <div className="flex justify-between items-center mb-6">
              <h2 className={`text-xl font-semibold ${theme === 'light' ? 'text-zinc-900' : 'text-zinc-100'}`}>AI Vision Settings</h2>
              <button onClick={() => setIsSettingsOpen(false)} className="text-zinc-500 hover:text-zinc-400">
                <X size={20} />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className={`block text-sm font-medium mb-1 ${theme === 'light' ? 'text-zinc-600' : 'text-zinc-400'}`}>AI Provider</label>
                <select 
                  value={apiConfig.provider}
                  onChange={handleProviderChange}
                  className={`w-full border rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500 ${theme === 'light' ? 'bg-zinc-50 border-zinc-200 text-zinc-900' : 'bg-zinc-950 border-zinc-800 text-zinc-200'}`}
                >
                  {Object.entries(PROVIDER_CONFIGS).map(([key, config]) => (
                    <option key={key} value={key}>{config.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className={`block text-sm font-medium mb-1 ${theme === 'light' ? 'text-zinc-600' : 'text-zinc-400'}`}>API Key</label>
                <input 
                  type="password"
                  value={apiConfig.apiKey}
                  onChange={(e) => setApiConfig({...apiConfig, apiKey: e.target.value})}
                  placeholder="sk-..."
                  className={`w-full border rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500 ${theme === 'light' ? 'bg-zinc-50 border-zinc-200 text-zinc-900' : 'bg-zinc-950 border-zinc-800 text-zinc-200'}`}
                />
                <p className={`text-xs mt-1 ${theme === 'light' ? 'text-zinc-500' : 'text-zinc-600'}`}>Stored securely in your browser's local storage.</p>
              </div>

              {apiConfig.provider !== 'gemini' && (
                <>
                  <div>
                    <label className={`block text-sm font-medium mb-1 ${theme === 'light' ? 'text-zinc-600' : 'text-zinc-400'}`}>Base URL</label>
                    <input 
                      type="text"
                      value={apiConfig.baseURL}
                      onChange={(e) => setApiConfig({...apiConfig, baseURL: e.target.value})}
                      placeholder="https://api.openai.com/v1"
                      className={`w-full border rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500 ${theme === 'light' ? 'bg-zinc-50 border-zinc-200 text-zinc-900' : 'bg-zinc-950 border-zinc-800 text-zinc-200'}`}
                    />
                  </div>
                  <div>
                    <label className={`block text-sm font-medium mb-1 ${theme === 'light' ? 'text-zinc-600' : 'text-zinc-400'}`}>Model Name</label>
                    <input 
                      type="text"
                      value={apiConfig.modelName}
                      onChange={(e) => setApiConfig({...apiConfig, modelName: e.target.value})}
                      placeholder="gpt-4o"
                      className={`w-full border rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500 ${theme === 'light' ? 'bg-zinc-50 border-zinc-200 text-zinc-900' : 'bg-zinc-950 border-zinc-800 text-zinc-200'}`}
                    />
                  </div>
                </>
              )}
            </div>

            <div className="mt-8 flex justify-end">
              <button 
                onClick={() => setIsSettingsOpen(false)}
                className="bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-medium px-6 py-2 rounded-lg transition-colors"
              >
                Save & Close
              </button>
            </div>
          </div>
        </div>
      )}

      <header className={`border-b p-4 flex items-center justify-between z-10 ${theme === 'light' ? 'border-zinc-200 bg-white/80' : 'border-zinc-800/80 bg-zinc-900/50'} backdrop-blur-md`}>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-md shadow-emerald-500/20 relative overflow-hidden">
              {/* Abstract Logo Design */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-4 h-4 border-2 border-zinc-950 rounded-sm transform rotate-45"></div>
                <div className="absolute w-1 h-5 bg-zinc-950 transform rotate-45"></div>
              </div>
            </div>
            <h1 className={`font-semibold tracking-tight ${theme === 'light' ? 'text-zinc-900' : 'text-zinc-100'}`}>ASC2 Flow</h1>
          </div>
          
          <div className={`w-px h-5 ${theme === 'light' ? 'bg-zinc-300' : 'bg-zinc-700'}`}></div>
          
          <button 
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            className={`p-1.5 rounded-md transition-colors ${theme === 'light' ? 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100'}`}
            title={`Switch to ${theme === 'light' ? 'Dark' : 'Light'} Mode`}
          >
            {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
          </button>
        </div>
        <div className="text-xs font-mono text-zinc-500 flex items-center gap-2">
          <span className="hidden sm:inline">Vibecoding Architecture Tool</span>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className={`w-16 border-r flex flex-col items-center py-6 gap-3 z-10 ${theme === 'light' ? 'border-zinc-200 bg-zinc-50' : 'border-zinc-800/80 bg-zinc-900/30'}`}>
          <ToolButton icon={<Square />} tool="box" current={tool} onClick={setTool} tooltip="Box (B)" theme={theme} />
          <ToolButton icon={<Minus />} tool="line" current={tool} onClick={setTool} tooltip="Line (L)" theme={theme} />
          <ToolButton icon={<ArrowRight />} tool="arrow" current={tool} onClick={setTool} tooltip="Arrow (A)" theme={theme} />
          <ToolButton icon={<Type />} tool="text" current={tool} onClick={setTool} tooltip="Text (T)" theme={theme} />
          <ToolButton icon={<Eraser />} tool="eraser" current={tool} onClick={setTool} tooltip="Eraser (E)" theme={theme} />
          
          <div className={`w-8 h-px my-2 ${theme === 'light' ? 'bg-zinc-200' : 'bg-zinc-800'}`} />
          
          <button onClick={handleCopy} className={`p-3 rounded-xl transition-colors ${theme === 'light' ? 'text-zinc-500 hover:text-emerald-600 hover:bg-zinc-200' : 'text-zinc-400 hover:text-emerald-400 hover:bg-zinc-800/50'}`} title="Copy ASCII (Ctrl+C)">
            <Copy size={20} />
          </button>
          <button onClick={handleExport} className={`p-3 rounded-xl transition-colors ${theme === 'light' ? 'text-zinc-500 hover:text-emerald-600 hover:bg-zinc-200' : 'text-zinc-400 hover:text-emerald-400 hover:bg-zinc-800/50'}`} title="Save as Markdown (Ctrl+S)">
            <Download size={20} />
          </button>
          <button 
            onClick={() => fileInputRef.current?.click()} 
            disabled={isImporting}
            className={`p-3 rounded-xl transition-colors ${isImporting ? 'text-emerald-500 bg-emerald-500/10' : (theme === 'light' ? 'text-zinc-500 hover:text-emerald-600 hover:bg-zinc-200' : 'text-zinc-400 hover:text-emerald-400 hover:bg-zinc-800/50')}`} 
            title="Import Image to ASCII"
          >
            {isImporting ? <Loader2 size={20} className="animate-spin" /> : <ImagePlus size={20} />}
          </button>
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleImportImage} 
            accept="image/*" 
            className="hidden" 
          />
          <button onClick={handleClear} className={`p-3 rounded-xl transition-colors ${theme === 'light' ? 'text-zinc-500 hover:text-red-500 hover:bg-zinc-200' : 'text-zinc-400 hover:text-red-400 hover:bg-zinc-800/50'}`} title="Clear Canvas">
            <Trash2 size={20} />
          </button>

          <div className="flex-1" />
          
          <button onClick={() => setIsChatOpen(!isChatOpen)} className={`p-3 rounded-xl transition-colors ${isChatOpen ? 'text-emerald-500 bg-emerald-500/10' : (theme === 'light' ? 'text-zinc-500 hover:text-emerald-600 hover:bg-zinc-200' : 'text-zinc-400 hover:text-emerald-400 hover:bg-zinc-800/50')}`} title="AI Architect Chat">
            <Sparkles size={20} />
          </button>
          <button onClick={() => setIsSettingsOpen(true)} className={`p-3 rounded-xl transition-colors ${theme === 'light' ? 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'}`} title="API Settings">
            <Settings size={20} />
          </button>
        </aside>

        <main className={`flex-1 overflow-auto p-4 sm:p-8 flex items-start justify-start sm:items-center sm:justify-center relative ${theme === 'light' ? 'bg-zinc-100' : 'bg-zinc-950'}`}>
          <div className={`relative shadow-2xl border rounded-lg overflow-hidden ${theme === 'light' ? 'bg-white border-zinc-200 shadow-zinc-200' : 'bg-zinc-900 border-zinc-800/80 shadow-black/50'}`}>
            <canvas
              ref={canvasRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              onTouchCancel={handleTouchEnd}
              className="cursor-crosshair block touch-none"
            />
          </div>
          
          <div className={`fixed bottom-6 right-6 text-xs font-mono p-4 rounded-xl border backdrop-blur-md shadow-xl pointer-events-none hidden lg:block ${theme === 'light' ? 'bg-white/80 border-zinc-200 text-zinc-500' : 'bg-zinc-900/80 border-zinc-800/80 text-zinc-500'}`}>
            <div className={`flex items-center gap-2 font-bold mb-2 ${theme === 'light' ? 'text-zinc-700' : 'text-zinc-300'}`}>
              <Info size={14} />
              Shortcuts
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2">
              <span className="flex justify-between gap-4"><span>Box</span> <kbd className={`px-1 rounded ${theme === 'light' ? 'bg-zinc-100 text-zinc-600' : 'text-zinc-400'}`}>B</kbd></span>
              <span className="flex justify-between gap-4"><span>Line</span> <kbd className={`px-1 rounded ${theme === 'light' ? 'bg-zinc-100 text-zinc-600' : 'text-zinc-400'}`}>L</kbd></span>
              <span className="flex justify-between gap-4"><span>Arrow</span> <kbd className={`px-1 rounded ${theme === 'light' ? 'bg-zinc-100 text-zinc-600' : 'text-zinc-400'}`}>A</kbd></span>
              <span className="flex justify-between gap-4"><span>Text</span> <kbd className={`px-1 rounded ${theme === 'light' ? 'bg-zinc-100 text-zinc-600' : 'text-zinc-400'}`}>T</kbd></span>
              <span className="flex justify-between gap-4"><span>Eraser</span> <kbd className={`px-1 rounded ${theme === 'light' ? 'bg-zinc-100 text-zinc-600' : 'text-zinc-400'}`}>E</kbd></span>
              <span className="flex justify-between gap-4"><span>Copy</span> <kbd className={`px-1 rounded ${theme === 'light' ? 'bg-zinc-100 text-zinc-600' : 'text-zinc-400'}`}>^C</kbd></span>
              <span className="flex justify-between gap-4"><span>Paste</span> <kbd className={`px-1 rounded ${theme === 'light' ? 'bg-zinc-100 text-zinc-600' : 'text-zinc-400'}`}>^V</kbd></span>
              <span className="flex justify-between gap-4"><span>Save MD</span> <kbd className={`px-1 rounded ${theme === 'light' ? 'bg-zinc-100 text-zinc-600' : 'text-zinc-400'}`}>^S</kbd></span>
            </div>
          </div>
        </main>

        {isChatOpen && (
          <aside className={`w-80 border-l flex flex-col z-20 backdrop-blur-md shadow-2xl ${theme === 'light' ? 'bg-white/90 border-zinc-200' : 'bg-zinc-900/50 border-zinc-800/80'}`}>
            <div className={`p-4 border-b flex justify-between items-center ${theme === 'light' ? 'bg-zinc-50 border-zinc-200' : 'bg-zinc-900 border-zinc-800/80'}`}>
              <h2 className={`font-semibold flex items-center gap-2 ${theme === 'light' ? 'text-zinc-900' : 'text-zinc-100'}`}><Sparkles size={16} className="text-emerald-500"/> AI Architect</h2>
              <button onClick={() => setIsChatOpen(false)} className={`hover:text-zinc-400 ${theme === 'light' ? 'text-zinc-400' : 'text-zinc-500'}`}><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.length === 0 && (
                <div className={`text-center text-sm mt-10 ${theme === 'light' ? 'text-zinc-500' : 'text-zinc-500'}`}>
                  <Bot size={32} className="mx-auto mb-3 opacity-50" />
                  <p>Describe the architecture or flow you want to build, and I'll generate the ASCII diagram for you.</p>
                  <p className="mt-2 text-xs opacity-70">e.g., "Draw a user login flow with OAuth"</p>
                </div>
              )}
              {messages.map((msg, i) => (
                <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                  <div className={`px-4 py-2 rounded-2xl max-w-[90%] text-sm ${msg.role === 'user' ? 'bg-emerald-600 text-white rounded-br-sm' : (theme === 'light' ? 'bg-zinc-100 text-zinc-800 rounded-bl-sm' : 'bg-zinc-800 text-zinc-200 rounded-bl-sm')}`}>
                    {msg.image && (
                      <img src={`data:${msg.image.mimeType};base64,${msg.image.base64}`} alt="Uploaded" className="max-w-full rounded-lg mb-2 border border-white/20" />
                    )}
                    {msg.content}
                  </div>
                </div>
              ))}
              {isGenerating && (
                <div className="flex items-start">
                  <div className={`px-4 py-3 rounded-2xl flex items-center gap-2 rounded-bl-sm ${theme === 'light' ? 'bg-zinc-100 text-zinc-800' : 'bg-zinc-800 text-zinc-200'}`}>
                    <Loader2 size={14} className="animate-spin" /> <span className="text-sm">Designing...</span>
                  </div>
                </div>
              )}
            </div>
            <div className={`p-4 border-t flex flex-col gap-2 ${theme === 'light' ? 'bg-zinc-50 border-zinc-200' : 'bg-zinc-900 border-zinc-800/80'}`}>
              {pendingImage && (
                <div className="relative self-start">
                  <img src={`data:${pendingImage.mimeType};base64,${pendingImage.base64}`} alt="Pending" className={`h-16 rounded-md border ${theme === 'light' ? 'border-zinc-300' : 'border-zinc-700'}`} />
                  <button onClick={() => setPendingImage(null)} className={`absolute -top-2 -right-2 rounded-full p-0.5 ${theme === 'light' ? 'bg-zinc-200 text-zinc-600 hover:bg-zinc-300' : 'bg-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-700'}`}>
                    <XCircle size={16} />
                  </button>
                </div>
              )}
              <div className={`flex items-center gap-2 border rounded-xl p-1 focus-within:border-emerald-500/50 transition-colors ${theme === 'light' ? 'bg-white border-zinc-300' : 'bg-zinc-950 border-zinc-800'}`}>
                <button 
                  onClick={() => chatFileInputRef.current?.click()}
                  className={`p-2 transition-colors ${theme === 'light' ? 'text-zinc-400 hover:text-emerald-500' : 'text-zinc-400 hover:text-emerald-400'}`}
                  title="Attach Image"
                >
                  <Paperclip size={16} />
                </button>
                <input 
                  type="file" 
                  ref={chatFileInputRef} 
                  onChange={handleChatImageUpload} 
                  accept="image/*" 
                  className="hidden" 
                />
                <input 
                  type="text" 
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
                  placeholder="Describe your diagram..."
                  className={`flex-1 bg-transparent border-none focus:outline-none text-sm px-1 py-2 ${theme === 'light' ? 'text-zinc-900 placeholder:text-zinc-400' : 'text-zinc-200'}`}
                />
                <button 
                  onClick={handleSendMessage}
                  disabled={isGenerating || (!chatInput.trim() && !pendingImage)}
                  className="p-2 bg-emerald-500 text-zinc-950 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-emerald-400 transition-colors"
                >
                  <Send size={16} />
                </button>
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

function ToolButton({ icon, tool, current, onClick, tooltip, theme }: { icon: React.ReactElement, tool: Tool, current: Tool, onClick: (t: Tool) => void, tooltip: string, theme: 'light' | 'dark' }) {
  const isActive = current === tool;
  
  let activeClass = 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-inner shadow-emerald-500/10';
  if (theme === 'light') {
    activeClass = 'bg-emerald-100 text-emerald-600 border border-emerald-200 shadow-inner shadow-emerald-500/5';
  }
  
  let inactiveClass = 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 border border-transparent';
  if (theme === 'light') {
    inactiveClass = 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200 border border-transparent';
  }

  return (
    <button
      onClick={() => onClick(tool)}
      title={tooltip}
      className={`p-3 rounded-xl transition-all ${isActive ? activeClass : inactiveClass}`}
    >
      {React.cloneElement(icon, { size: 20 })}
    </button>
  );
}
