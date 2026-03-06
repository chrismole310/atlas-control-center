import { NextResponse } from 'next/server'
import { readFileSync } from 'fs'
import path from 'path'

export interface Book {
  number: number
  title: string
  leadCharacter: string
  status: 'EXISTING DRAFT' | 'NEEDS DRAFTING' | 'IN PROGRESS' | 'COMPLETE'
  wordCount: number
  targetWords: number
  wave: number
}

export interface AuthorProfile {
  author_id: string
  pen_name: string
  genre: string
  status: string
  series_name: string
  total_books_planned: number
  target_words_per_book: number
  publishing_imprint: string
  distribution_platforms: string[]
}

interface ActiveAuthor {
  active_author_id: string
  switched_at: string
}

function parseReadingOrderMarkdown(md: string): Book[] {
  const books: Book[] = []

  // Find the table lines — skip the header and separator rows
  const lines = md.split('\n')
  let inTable = false

  for (const line of lines) {
    const trimmed = line.trim()

    // Detect the start of the table by its header
    if (trimmed.startsWith('| #') && trimmed.includes('Title') && trimmed.includes('Status')) {
      inTable = true
      continue
    }

    // Skip the separator row (|---|---|...|)
    if (inTable && /^\|[-| ]+\|$/.test(trimmed)) {
      continue
    }

    // Stop parsing if we hit a blank line after the table started
    if (inTable && !trimmed.startsWith('|')) {
      break
    }

    if (inTable && trimmed.startsWith('|')) {
      // Parse: | # | Title | Lead Character | Status | Word Count | Wave |
      const cols = trimmed
        .split('|')
        .map(c => c.trim())
        .filter(c => c.length > 0)

      if (cols.length < 6) continue

      const number = parseInt(cols[0], 10)
      const title = cols[1]
      const leadCharacter = cols[2]
      const rawStatus = cols[3] as Book['status']
      const wordCountStr = cols[4].replace(/,/g, '')
      const wordCount = parseInt(wordCountStr, 10) || 0
      const waveStr = cols[5] // e.g. "Wave 3"
      const waveMatch = waveStr.match(/Wave\s+(\d+)/i)
      const wave = waveMatch ? parseInt(waveMatch[1], 10) : 5

      if (!isNaN(number)) {
        books.push({
          number,
          title,
          leadCharacter,
          status: rawStatus,
          wordCount,
          targetWords: profile.target_words_per_book,
          wave,
        })
      }
    }
  }

  return books
}

export async function GET() {
  try {
    // Resolve path to atlas-novel-portal — one level up from the frontend directory
    const novelPortalDir = path.join(process.cwd(), '..', 'atlas-novel-portal')

    // Read active_author.json
    const activeAuthorRaw = readFileSync(
      path.join(novelPortalDir, 'active_author.json'),
      'utf-8'
    )
    const activeAuthor: ActiveAuthor = JSON.parse(activeAuthorRaw)
    const authorId = activeAuthor.active_author_id
    if (!/^[\w-]+$/.test(authorId)) {
      return NextResponse.json({ error: 'Invalid author ID' }, { status: 500 })
    }

    // Read author profile
    const profileRaw = readFileSync(
      path.join(novelPortalDir, 'author_profiles', authorId, 'profile.json'),
      'utf-8'
    )
    const profile: AuthorProfile = JSON.parse(profileRaw)

    // Read series reading order markdown
    const readingOrderMd = readFileSync(
      path.join(novelPortalDir, 'author_profiles', authorId, 'series_reading_order.md'),
      'utf-8'
    )

    const books = parseReadingOrderMarkdown(readingOrderMd)

    // Compute stats
    const totalWords = books.reduce((sum, b) => sum + b.wordCount, 0)
    const totalTarget = books.reduce((sum, b) => sum + b.targetWords, 0)
    const completionPct = totalTarget > 0 ? Math.round((totalWords / totalTarget) * 100 * 10) / 10 : 0
    const existingDrafts = books.filter(b => b.status === 'EXISTING DRAFT').length
    const needsDrafting = books.filter(b => b.status === 'NEEDS DRAFTING').length

    return NextResponse.json({
      activeAuthor: profile,
      books,
      stats: {
        totalBooks: books.length,
        totalWords,
        totalTarget,
        completionPct,
        existingDrafts,
        needsDrafting,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
