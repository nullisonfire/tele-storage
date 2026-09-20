import { db } from '../database/jsonDatabase';
import { DirectoryItem, MediaItem } from '../types';

export interface SearchResult {
  query: string;
  directories: DirectoryItem[];
  files: MediaItem[];
  total_matches: number;
  page: number;
  page_size: number;
}

export class SearchService {
  public async search(query: string, page: number = 1, pageSize: number = 30): Promise<SearchResult> {
    const cleanQuery = query.trim().toLowerCase();
    if (!cleanQuery) {
      return {
        query: '',
        directories: [],
        files: [],
        total_matches: 0,
        page: 1,
        page_size: pageSize,
      };
    }

    const allDirs = await db.getAllDirectories();
    const allMedia = await db.getAllMedia();

    // Match directories (by name or path)
    const matchedDirs = allDirs.filter((d) => {
      if (d.path === '/') return false;
      return d.name.toLowerCase().includes(cleanQuery) || d.path.toLowerCase().includes(cleanQuery);
    });

    // Match media files (by name, path, or description)
    const matchedFiles = allMedia.filter((m) => {
      return (
        m.name.toLowerCase().includes(cleanQuery) ||
        m.directory.toLowerCase().includes(cleanQuery) ||
        (m.description && m.description.toLowerCase().includes(cleanQuery))
      );
    });

    const totalMatches = matchedDirs.length + matchedFiles.length;
    const startIndex = (page - 1) * pageSize;
    const paginatedFiles = matchedFiles.slice(startIndex, startIndex + pageSize);

    return {
      query,
      directories: matchedDirs.slice(0, 10), // return top directories
      files: paginatedFiles,
      total_matches: totalMatches,
      page,
      page_size: pageSize,
    };
  }
}

export const searchService = new SearchService();
