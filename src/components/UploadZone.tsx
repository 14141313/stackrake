import { useCallback, useRef, useState } from 'react'
import { splitHands } from '../lib/splitHands'
import { parseSessionHand } from '../lib/parseSessionHand'
import { analyseSession } from '../lib/analyseSession'
import type { SessionResult } from '../lib/types'

interface Props {
  onResult: (result: SessionResult) => void
}

type ParseState = 'idle' | 'parsing' | 'done'

export function UploadZone({ onResult }: Props) {
  const [state, setState] = useState<ParseState>('idle')
  const [dragging, setDragging] = useState(false)
  const [fileNames, setFileNames] = useState<string[]>([])
  const [handCount, setHandCount] = useState(0)
  const [skipped, setSkipped] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const processFiles = useCallback(async (fileList: FileList) => {
    const names: string[] = []
    const texts: string[] = []

    for (const file of Array.from(fileList)) {
      if (!file.name.endsWith('.txt')) continue
      names.push(file.name)
      texts.push(await file.text())
    }

    if (names.length === 0) return

    setFileNames(names)
    setState('parsing')
    await new Promise(r => setTimeout(r, 20))

    const combined = texts.join('\n')
    const handStrings = splitHands(combined)
    const parsed = handStrings.map(parseSessionHand)
    const valid = parsed.filter((h): h is NonNullable<typeof h> => h !== null)
    const skippedCount = parsed.length - valid.length

    setHandCount(valid.length)
    setSkipped(skippedCount)

    const result = analyseSession(valid)
    onResult(result)
    setState('done')
  }, [onResult])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    if (e.dataTransfer.files.length > 0) processFiles(e.dataTransfer.files)
  }, [processFiles])

  const onInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) processFiles(e.target.files)
  }, [processFiles])

  const reset = useCallback(() => {
    setState('idle')
    setFileNames([])
    setHandCount(0)
    setSkipped(0)
    if (inputRef.current) inputRef.current.value = ''
  }, [])

  if (state === 'idle') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[55vh]">
        <h1 className="text-2xl font-mono text-gray-900 mb-1">Stackrake</h1>
        <p className="text-gray-500 text-sm mb-10">PLO analytics · GGPoker & Natural8 · Client-side</p>

        <div
          className={`w-full max-w-lg border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
            dragging ? 'border-brand bg-brand-light/30' : 'border-gray-200 hover:border-brand hover:bg-brand-light/20'
          }`}
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
        >
          <div className="text-4xl mb-4 text-gray-400">⬆</div>
          <p className="text-gray-600 mb-1">Drop hand history files here</p>
          <p className="text-gray-400 text-sm">or click to browse · .txt files · drop a whole session folder</p>
          <input
            ref={inputRef}
            type="file"
            accept=".txt"
            multiple
            className="hidden"
            onChange={onInputChange}
          />
        </div>
      </div>
    )
  }

  if (state === 'parsing') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[55vh]">
        <div className="text-gray-400 font-mono text-sm animate-pulse">Parsing {fileNames.length} file{fileNames.length !== 1 ? 's' : ''}…</div>
      </div>
    )
  }

  // done
  return (
    <div className="flex items-center justify-between mb-6 text-xs text-gray-500 font-mono">
      <div className="flex gap-4 flex-wrap">
        <span className="text-gray-600">{fileNames.length} file{fileNames.length !== 1 ? 's' : ''}</span>
        <span>{handCount.toLocaleString()} hands parsed</span>
        {skipped > 0 && (
          <span className="text-yellow-600">{skipped} skipped</span>
        )}
      </div>
      <button onClick={reset} className="text-gray-400 hover:text-gray-600 transition-colors">
        ✕ clear
      </button>
    </div>
  )
}
