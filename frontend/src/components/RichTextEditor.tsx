"use client";
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import { Table, TableRow, TableCell, TableHeader } from '@tiptap/extension-table'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import Placeholder from '@tiptap/extension-placeholder'
import { createLowlight } from 'lowlight'
import css from 'highlight.js/lib/languages/css'
import js from 'highlight.js/lib/languages/javascript'
import ts from 'highlight.js/lib/languages/typescript'
import html from 'highlight.js/lib/languages/xml'
import python from 'highlight.js/lib/languages/python'
import bash from 'highlight.js/lib/languages/bash'
import { useRef, useEffect } from 'react'
import { api } from '@/lib/api'

const lowlight = createLowlight()
lowlight.register('css', css)
lowlight.register('js', js)
lowlight.register('javascript', js)
lowlight.register('ts', ts)
lowlight.register('typescript', ts)
lowlight.register('html', html)
lowlight.register('xml', html)
lowlight.register('python', python)
lowlight.register('bash', bash)

interface ToolbarButtonProps {
  onClick: () => void
  active?: boolean
  title?: string
  children: React.ReactNode
}

function ToolbarButton({ onClick, active, title, children }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onMouseDown={(e) => {
        e.preventDefault()
        onClick()
      }}
      title={title}
      className={`
        px-2 py-1 rounded text-sm font-medium transition-colors min-w-[28px] h-7 flex items-center justify-center
        ${active
          ? 'bg-blue-600 text-white'
          : 'bg-transparent text-gray-700 hover:bg-gray-200'
        }
      `}
    >
      {children}
    </button>
  )
}

function Divider() {
  return <div className="w-px h-5 bg-gray-200 mx-1" />
}

export default function RichTextEditor({
  content,
  onChange,
  placeholder,
}: {
  content: string
  onChange: (html: string) => void
  placeholder?: string
}) {
  const imageInputRef = useRef<HTMLInputElement>(null)

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        codeBlock: false,
      }),
      Image.configure({
        HTMLAttributes: {
          class: 'max-w-full rounded-lg my-2',
        },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-blue-600 underline',
        },
      }),
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      CodeBlockLowlight.configure({ lowlight }),
      Placeholder.configure({
        placeholder: placeholder || 'Commencez à écrire…',
      }),
    ],
    content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML())
    },
  })

  // Sync content from outside (e.g. when editing an existing post)
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      // Only update if editor is empty or content was reset externally
      if (!editor.isFocused) {
        editor.commands.setContent(content, false)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content])

  function handleSetLink() {
    if (!editor) return
    const prev = editor.getAttributes('link').href as string | undefined
    const url = window.prompt('URL du lien', prev || 'https://')
    if (url === null) return
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!editor) return
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const formData = new FormData()
      formData.append('file', file)
      const { data } = await api.post('/admin/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      editor.chain().focus().setImage({ src: data.url }).run()
    } catch (err) {
      console.error('Image upload failed', err)
      alert("Erreur lors de l'upload de l'image.")
    } finally {
      // Reset file input so same file can be selected again
      if (imageInputRef.current) imageInputRef.current.value = ''
    }
  }

  function insertTable() {
    editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
  }

  if (!editor) return null

  return (
    <div className="tiptap-editor border border-gray-200 rounded-xl overflow-hidden bg-white">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-gray-200 bg-gray-50">
        {/* Formatting */}
        <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Gras">
          <strong>B</strong>
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="Italique">
          <em>I</em>
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} title="Barré">
          <s>S</s>
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleCode().run()} active={editor.isActive('code')} title="Code inline">
          <span className="font-mono text-xs">`c`</span>
        </ToolbarButton>

        <Divider />

        {/* Headings */}
        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} title="Titre H2">
          H2
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive('heading', { level: 3 })} title="Titre H3">
          H3
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 4 }).run()} active={editor.isActive('heading', { level: 4 })} title="Titre H4">
          H4
        </ToolbarButton>

        <Divider />

        {/* Lists */}
        <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="Liste à puces">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M6 4.75A.75.75 0 016.75 4h10.5a.75.75 0 010 1.5H6.75A.75.75 0 016 4.75zM6 10a.75.75 0 01.75-.75h10.5a.75.75 0 010 1.5H6.75A.75.75 0 016 10zm0 5.25a.75.75 0 01.75-.75h10.5a.75.75 0 010 1.5H6.75a.75.75 0 01-.75-.75zM2.5 5a.5.5 0 100-1 .5.5 0 000 1zm0 5a.5.5 0 100-1 .5.5 0 000 1zm0 5a.5.5 0 100-1 .5.5 0 000 1z" clipRule="evenodd" />
          </svg>
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="Liste numérotée">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M3 4a1 1 0 011-1h.01a1 1 0 010 2H4a1 1 0 01-1-1zm1.5 6a.5.5 0 00-.5.5v.01a.5.5 0 001 0V10.5a.5.5 0 00-.5-.5zm-.5 5.5a.5.5 0 011 0v.01a.5.5 0 01-1 0V15.5zm3-11.25A.75.75 0 017.75 4h8.5a.75.75 0 010 1.5h-8.5A.75.75 0 017 4.75zm0 5.5A.75.75 0 017.75 9.5h8.5a.75.75 0 010 1.5h-8.5A.75.75 0 017 10.25zm0 5.5a.75.75 0 01.75-.75h8.5a.75.75 0 010 1.5h-8.5a.75.75 0 01-.75-.75z" clipRule="evenodd" />
          </svg>
        </ToolbarButton>

        <Divider />

        {/* Blocks */}
        <ToolbarButton onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive('blockquote')} title="Citation">
          <span className="text-base font-bold leading-none">&ldquo;</span>
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleCodeBlock().run()} active={editor.isActive('codeBlock')} title="Bloc de code">
          <span className="font-mono text-xs">{'</>'}</span>
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Séparateur horizontal">
          <span className="text-xs">—</span>
        </ToolbarButton>

        <Divider />

        {/* Link */}
        <ToolbarButton onClick={handleSetLink} active={editor.isActive('link')} title="Insérer un lien">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M12.232 4.232a2.5 2.5 0 013.536 3.536l-1.225 1.224a.75.75 0 001.061 1.06l1.224-1.224a4 4 0 00-5.656-5.656l-3 3a4 4 0 00.225 5.865.75.75 0 00.977-1.138 2.5 2.5 0 01-.142-3.667l3-3z" />
            <path d="M11.603 7.963a.75.75 0 00-.977 1.138 2.5 2.5 0 01.142 3.667l-3 3a2.5 2.5 0 01-3.536-3.536l1.225-1.224a.75.75 0 00-1.061-1.06l-1.224 1.224a4 4 0 105.656 5.656l3-3a4 4 0 00-.225-5.865z" />
          </svg>
        </ToolbarButton>

        {/* Image upload */}
        <ToolbarButton onClick={() => imageInputRef.current?.click()} title="Insérer une image">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M1 5.25A2.25 2.25 0 013.25 3h13.5A2.25 2.25 0 0119 5.25v9.5A2.25 2.25 0 0116.75 17H3.25A2.25 2.25 0 011 14.75v-9.5zm1.5 5.81v3.69c0 .414.336.75.75.75h13.5a.75.75 0 00.75-.75v-2.69l-2.22-2.219a.75.75 0 00-1.06 0l-1.91 1.909.47.47a.75.75 0 11-1.06 1.06L6.53 8.091a.75.75 0 00-1.06 0l-2.97 2.97zM12 7a1 1 0 11-2 0 1 1 0 012 0z" clipRule="evenodd" />
          </svg>
        </ToolbarButton>
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleImageUpload}
        />

        {/* Table */}
        <ToolbarButton onClick={insertTable} title="Insérer un tableau">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M.99 5.24A2.25 2.25 0 013.25 3h13.5A2.25 2.25 0 0119 5.25l.01 9.5A2.25 2.25 0 0116.76 17H3.26A2.267 2.267 0 011 14.75l-.01-9.5zm8.26 9.52v-.001l6.01-.004a.75.75 0 00.74-.755l-.003-4.5a.75.75 0 00-.75-.743H9.25v6.003zm-1.5-6.003H3.26l-.01 4.495a.75.75 0 00.75.753h3.51v-5.248zm.5-1.5H16.5l-.003-2.247a.75.75 0 00-.75-.742H3.25a.75.75 0 00-.75.75v2.24h5.75z" clipRule="evenodd" />
          </svg>
        </ToolbarButton>
      </div>

      {/* Editor Content */}
      <EditorContent editor={editor} />
    </div>
  )
}
