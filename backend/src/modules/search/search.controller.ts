import { Controller, DefaultValuePipe, Get, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { KeycloakAuthGuard } from '../../infra/keycloak/keycloak-auth.guard';
import { TagDto } from '../tags/dto/tag.dto';
import { SearchAssetsQueryDto, SearchAssetsResponseDto } from './dto/search.dto';
import { SearchService } from './search.service';

@ApiTags('Search')
@ApiBearerAuth('keycloak')
@Controller('search')
@UseGuards(KeycloakAuthGuard)
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get('assets')
  @ApiOperation({ summary: 'Full-text search over assets via Meilisearch.' })
  @ApiOkResponse({ type: SearchAssetsResponseDto })
  searchAssets(@Query() query: SearchAssetsQueryDto): Promise<SearchAssetsResponseDto> {
    return this.search.searchAssets(query);
  }

  @Get('tags')
  @ApiOperation({ summary: 'Fuzzy / partial-match tag autocomplete via Meilisearch.' })
  @ApiQuery({ name: 'q', required: true })
  @ApiQuery({ name: 'limit', required: false })
  @ApiOkResponse({ type: TagDto, isArray: true })
  searchTags(
    @Query('q') q: string,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ): Promise<TagDto[]> {
    return this.search.searchTags(q, limit);
  }
}
