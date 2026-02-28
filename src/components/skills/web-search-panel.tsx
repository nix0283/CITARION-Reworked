'use client';

import { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Search, ExternalLink, Globe, TrendingUp, Newspaper } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getWebSearchClient, type SearchResult } from '@/lib/skills/web-search-client';

interface WebSearchPanelProps {
  initialQuery?: string;
  onResultSelect?: (result: SearchResult) => void;
  compact?: boolean;
}

export function WebSearchPanel({ initialQuery = '', onResultSelect, compact = false }: WebSearchPanelProps) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchType, setSearchType] = useState<'web' | 'news'>('web');
  const { toast } = useToast();

  const searchClient = getWebSearchClient();

  const performSearch = useCallback(async () => {
    if (!query.trim()) {
      toast({
        variant: 'destructive',
        title: 'Введите поисковый запрос',
      });
      return;
    }

    setLoading(true);
    try {
      const searchResults = searchType === 'news'
        ? await searchClient.searchNews(query, 10)
        : await searchClient.search(query, { maxResults: 10 });
      
      setResults(searchResults);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Ошибка поиска',
        description: error instanceof Error ? error.message : 'Неизвестная ошибка',
      });
    } finally {
      setLoading(false);
    }
  }, [query, searchType, searchClient, toast]);

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      performSearch();
    }
  };

  const openUrl = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
    onResultSelect?.({ url, title: '', snippet: '' });
  };

  if (compact) {
    return (
      <div className="flex gap-2">
        <Input
          placeholder="Search web..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyPress={handleKeyPress}
          className="flex-1"
          size="sm"
        />
        <Button 
          size="sm" 
          onClick={performSearch}
          disabled={loading}
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
        </Button>
      </div>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Globe className="w-5 h-5" />
          Web Search
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Search Input */}
        <div className="flex gap-2">
          <Input
            placeholder="Enter search query..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyPress={handleKeyPress}
            className="flex-1"
          />
          <Button 
            onClick={performSearch}
            disabled={loading}
            className="min-w-[100px]"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Search className="w-4 h-4 mr-2" />
                Search
              </>
            )}
          </Button>
        </div>

        {/* Search Type Toggle */}
        <div className="flex gap-2">
          <Button
            variant={searchType === 'web' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSearchType('web')}
            className="flex-1"
          >
            <Globe className="w-4 h-4 mr-2" />
            Web
          </Button>
          <Button
            variant={searchType === 'news' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSearchType('news')}
            className="flex-1"
          >
            <Newspaper className="w-4 h-4 mr-2" />
            News
          </Button>
        </div>

        {/* Results */}
        <ScrollArea className="h-[400px] border rounded-md">
          {results.length > 0 ? (
            <div className="p-4 space-y-4">
              {results.map((result, idx) => (
                <div 
                  key={idx}
                  className="p-3 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                  onClick={() => onResultSelect?.(result)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="font-medium text-sm text-blue-600 hover:underline line-clamp-2">
                      {result.title || result.url}
                    </h4>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={(e) => {
                        e.stopPropagation();
                        openUrl(result.url);
                      }}
                    >
                      <ExternalLink className="w-3 h-3" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-3">
                    {result.snippet}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    {result.source && (
                      <Badge variant="secondary" className="text-xs">
                        {result.source}
                      </Badge>
                    )}
                    {result.score && (
                      <Badge variant="outline" className="text-xs">
                        Score: {(result.score * 100).toFixed(0)}%
                      </Badge>
                    )}
                    {result.publishedDate && (
                      <span className="text-xs text-muted-foreground">
                        {new Date(result.publishedDate).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full py-12 text-muted-foreground">
              {loading ? (
                <>
                  <Loader2 className="w-8 h-8 animate-spin mb-4" />
                  <p>Searching...</p>
                </>
              ) : (
                <>
                  <Search className="w-12 h-12 opacity-30 mb-4" />
                  <p>Enter a query to search the web</p>
                </>
              )}
            </div>
          )}
        </ScrollArea>

        {/* Trending Topics (если есть) */}
        {results.length === 0 && !loading && (
          <div className="pt-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
              <TrendingUp className="w-4 h-4" />
              <span>Popular searches:</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {['crypto market analysis', 'trading strategies', 'technical indicators', 'market news'].map((topic) => (
                <Badge 
                  key={topic}
                  variant="outline"
                  className="cursor-pointer hover:bg-muted"
                  onClick={() => {
                    setQuery(topic);
                    performSearch();
                  }}
                >
                  {topic}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default WebSearchPanel;
