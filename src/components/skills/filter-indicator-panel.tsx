'use client';

import { useState, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ChevronUp, Settings, Filter, Activity, Brain } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getBotFilter, type BotType } from '@/lib/bot-filters';
import { getIndicator, type IndicatorName } from '@/lib/indicators';

interface FilterIndicatorPanelProps {
  symbol: string;
  timeframe: string;
  onFilterChange?: (filterConfig: any) => void;
  onIndicatorChange?: (indicatorConfig: any) => void;
}

export function FilterIndicatorPanel({ symbol, timeframe, onFilterChange, onIndicatorChange }: FilterIndicatorPanelProps) {
  const [activeFilters, setActiveFilters] = useState<Record<BotType, boolean>>({
    BB: false,
    DCA: false,
    VISION: false,
    GRID: false,
    ARGUS: false,
  });
  
  const [activeIndicators, setActiveIndicators] = useState<Record<IndicatorName, boolean>>({
    RSI: true,
    MACD: true,
    BB: false,
    EMA: true,
    SMA: false,
    ATR: false,
    ADX: false,
    ML_ST: false,
    NPC: false,
    SQZ: false,
    AST: false,
    KR: false,
    KMV: false,
    WT: false,
  });

  const [filterSettings, setFilterSettings] = useState({
    minProbability: 0.65,
    confidenceThreshold: 0.6,
    volumeConfirmation: true,
  });

  const [expandedSections, setExpandedSections] = useState({
    filters: true,
    indicators: true,
    ml: false,
  });

  const { toast } = useToast();

  const toggleFilter = useCallback((botType: BotType) => {
    setActiveFilters(prev => {
      const updated = { ...prev, [botType]: !prev[botType] };
      onFilterChange?.({ botType, enabled: updated[botType], settings: filterSettings });
      return updated;
    });
  }, [filterSettings, onFilterChange]);

  const toggleIndicator = useCallback((indicator: IndicatorName) => {
    setActiveIndicators(prev => {
      const updated = { ...prev, [indicator]: !prev[indicator] };
      onIndicatorChange?.({ indicator, enabled: updated[indicator] });
      return updated;
    });
  }, [onIndicatorChange]);

  const handleSettingChange = useCallback((key: string, value: any) => {
    setFilterSettings(prev => {
      const updated = { ...prev, [key]: value };
      onFilterChange?.({ settings: updated });
      return updated;
    });
  }, [onFilterChange]);

  const toggleSection = useCallback((section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  }, []);

  const activeFiltersCount = useMemo(() => 
    Object.values(activeFilters).filter(v => v).length,
    [activeFilters]
  );

  const activeIndicatorsCount = useMemo(() => 
    Object.values(activeIndicators).filter(v => v).length,
    [activeIndicators]
  );

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Filters & Indicators
          </span>
          <div className="flex gap-4 text-sm text-muted-foreground">
            <span>{activeFiltersCount} filters active</span>
            <span>{activeIndicatorsCount} indicators active</span>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Bot Filters Section */}
        <Collapsible open={expandedSections.filters} onOpenChange={() => toggleSection('filters')}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="w-full justify-between p-2 h-auto">
              <span className="flex items-center gap-2">
                <Filter className="w-4 h-4" />
                Bot Filters
              </span>
              {expandedSections.filters ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-3 pt-2">
            {/* Filter Toggles */}
            <div className="grid grid-cols-2 gap-2">
              {(['BB', 'DCA', 'VISION', 'GRID', 'ARGUS'] as BotType[]).map((botType) => (
                <div key={botType} className="flex items-center justify-between p-2 border rounded-lg">
                  <Label htmlFor={`filter-${botType}`} className="text-sm cursor-pointer">
                    {botType} Filter
                  </Label>
                  <Switch
                    id={`filter-${botType}`}
                    checked={activeFilters[botType]}
                    onCheckedChange={() => toggleFilter(botType)}
                  />
                </div>
              ))}
            </div>

            {/* Filter Settings */}
            <div className="space-y-4 pt-2 border-t">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label className="text-sm">Min Probability</Label>
                  <span className="text-sm text-muted-foreground">{(filterSettings.minProbability * 100).toFixed(0)}%</span>
                </div>
                <Slider
                  value={[filterSettings.minProbability]}
                  onValueChange={([value]) => handleSettingChange('minProbability', value)}
                  min={0.5}
                  max={0.95}
                  step={0.05}
                />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label className="text-sm">Confidence Threshold</Label>
                  <span className="text-sm text-muted-foreground">{(filterSettings.confidenceThreshold * 100).toFixed(0)}%</span>
                </div>
                <Slider
                  value={[filterSettings.confidenceThreshold]}
                  onValueChange={([value]) => handleSettingChange('confidenceThreshold', value)}
                  min={0.5}
                  max={0.9}
                  step={0.05}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="volume-confirmation" className="text-sm">Volume Confirmation</Label>
                <Switch
                  id="volume-confirmation"
                  checked={filterSettings.volumeConfirmation}
                  onCheckedChange={(checked) => handleSettingChange('volumeConfirmation', checked)}
                />
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Technical Indicators Section */}
        <Collapsible open={expandedSections.indicators} onOpenChange={() => toggleSection('indicators')}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="w-full justify-between p-2 h-auto">
              <span className="flex items-center gap-2">
                <Activity className="w-4 h-4" />
                Technical Indicators
              </span>
              {expandedSections.indicators ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-3 pt-2">
            {/* Basic Indicators */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground uppercase">Basic</Label>
              <div className="grid grid-cols-3 gap-2">
                {(['RSI', 'MACD', 'BB', 'EMA', 'SMA', 'ATR', 'ADX'] as IndicatorName[]).map((indicator) => (
                  <div key={indicator} className="flex items-center justify-between p-2 border rounded-lg">
                    <Label htmlFor={`ind-${indicator}`} className="text-xs cursor-pointer">
                      {indicator}
                    </Label>
                    <Switch
                      id={`ind-${indicator}`}
                      checked={activeIndicators[indicator]}
                      onCheckedChange={() => toggleIndicator(indicator)}
                      className="scale-75"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* ML Indicators */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground uppercase">ML Enhanced</Label>
              <div className="grid grid-cols-3 gap-2">
                {(['ML_ST', 'NPC', 'SQZ', 'AST', 'KR', 'KMV', 'WT'] as IndicatorName[]).map((indicator) => (
                  <div key={indicator} className="flex items-center justify-between p-2 border rounded-lg">
                    <Label htmlFor={`ind-${indicator}`} className="text-xs cursor-pointer">
                      {indicator}
                    </Label>
                    <Switch
                      id={`ind-${indicator}`}
                      checked={activeIndicators[indicator]}
                      onCheckedChange={() => toggleIndicator(indicator)}
                      className="scale-75"
                    />
                  </div>
                ))}
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* ML/AI Section */}
        <Collapsible open={expandedSections.ml} onOpenChange={() => toggleSection('ml')}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="w-full justify-between p-2 h-auto">
              <span className="flex items-center gap-2">
                <Brain className="w-4 h-4" />
                ML/AI Features
              </span>
              {expandedSections.ml ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-3 pt-2">
            <div className="p-3 bg-muted/30 rounded-lg text-sm">
              <p className="text-muted-foreground">
                ML features require Lawrence Classifier training. 
                Enable filters to auto-train on {symbol} data.
              </p>
              <Button 
                variant="outline" 
                size="sm" 
                className="mt-2 w-full"
                onClick={async () => {
                  try {
                    const filter = await getBotFilter('BB', symbol);
                    if (filter.initialize) {
                      await filter.initialize();
                      toast({
                        title: 'ML Model Trained',
                        description: `Classifier ready for ${symbol}`,
                      });
                    }
                  } catch (error) {
                    toast({
                      variant: 'destructive',
                      title: 'Training Failed',
                      description: error instanceof Error ? error.message : 'Unknown error',
                    });
                  }
                }}
              >
                Train Model for {symbol}
              </Button>
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Quick Actions */}
        <div className="pt-2 border-t flex gap-2">
          <Button 
            variant="outline" 
            size="sm"
            className="flex-1"
            onClick={() => {
              // Reset to defaults
              setActiveFilters({ BB: false, DCA: false, VISION: false, GRID: false, ARGUS: false });
              setActiveIndicators({
                RSI: true, MACD: true, BB: false, EMA: true, SMA: false,
                ATR: false, ADX: false, ML_ST: false, NPC: false, SQZ: false,
                AST: false, KR: false, KMV: false, WT: false,
              });
              setFilterSettings({ minProbability: 0.65, confidenceThreshold: 0.6, volumeConfirmation: true });
              toast({ title: 'Settings Reset', description: 'Restored default configuration' });
            }}
          >
            Reset
          </Button>
          <Button 
            size="sm"
            className="flex-1"
            onClick={() => {
              toast({
                title: 'Configuration Applied',
                description: `${activeFiltersCount} filters, ${activeIndicatorsCount} indicators active`,
              });
            }}
          >
            Apply
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default FilterIndicatorPanel;
