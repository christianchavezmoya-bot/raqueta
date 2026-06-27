import { Injectable, Logger } from '@nestjs/common';
import { load } from 'cheerio';

export interface TenisChileRankingSnapshot {
  playerId: string;
  name: string;
  rank: number | null;
  points: number | null;
  atpPoints: number | null;
}

@Injectable()
export class TenisChileService {
  private readonly logger = new Logger(TenisChileService.name);
  private readonly baseUrl = 'https://www.tenischile.com';

  parsePlayerId(input: string): string | null {
    const value = input.trim();
    if (/^\d+$/.test(value)) return value;

    try {
      const url = new URL(value);
      const match = url.pathname.match(/\/jugador\/(\d+)/);
      return match?.[1] ?? null;
    } catch {
      const match = value.match(/jugador\/(\d+)/);
      return match?.[1] ?? null;
    }
  }

  async fetchPlayerRanking(playerId: string): Promise<TenisChileRankingSnapshot | null> {
    const url = `${this.baseUrl}/jugador/${playerId}`;
    const response = await fetch(url, {
      headers: {
        'user-agent': 'NGoBot/1.0 (+https://n-go.app)',
        accept: 'text/html,application/xhtml+xml',
      },
    });

    if (!response.ok) {
      this.logger.warn(`TenisChile returned ${response.status} for player ${playerId}`);
      return null;
    }

    const html = await response.text();
    return this.parseProfileHtml(playerId, html);
  }

  private parseProfileHtml(playerId: string, html: string): TenisChileRankingSnapshot | null {
    const $ = load(html);
    const rawText = $('body').text().replace(/\s+/g, ' ').trim();

    const heading = $('h1').first().text().trim();
    const title = $('title').text().trim();
    const name = this.cleanName(heading || title, rawText);
    const rank = this.extractMetric(rawText, ['ranking nacional', 'ranking run', 'ranking']);
    const points = this.extractMetric(rawText, ['puntos run', 'puntaje', 'puntos']);
    const atpPoints = this.extractMetric(rawText, ['puntos atp', 'atp']);

    if (!name || rank === null && points === null && atpPoints === null) {
      this.logger.warn(`Unable to parse TenisChile profile ${playerId}`);
      return null;
    }

    return { playerId, name, rank, points, atpPoints };
  }

  private cleanName(candidate: string, fallbackText: string): string {
    const value = candidate
      .replace(/\|.*$/, '')
      .replace(/-\s*TenisChile.*$/i, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (value && !/^tenischile/i.test(value)) return value;

    const match = fallbackText.match(/Jugador\s*:?\s*([A-Za-z?-?' .-]{4,})/i);
    return match?.[1]?.trim() ?? '';
  }

  private extractMetric(text: string, labels: string[]): number | null {
    for (const label of labels) {
      const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`${escaped}[^\\d]{0,20}([\\d.]+)`, 'i');
      const match = text.match(regex);
      if (match) {
        const value = Number(match[1].replace(/\./g, ''));
        if (!Number.isNaN(value)) return value;
      }
    }

    return null;
  }
}
