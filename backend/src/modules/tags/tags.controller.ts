import { Controller, DefaultValuePipe, Get, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { KeycloakAuthGuard } from '../../infra/keycloak/keycloak-auth.guard';
import { TagDto } from './dto/tag.dto';
import { TagsService } from './tags.service';

@ApiTags('Tags')
@ApiBearerAuth('keycloak')
@Controller('tags')
@UseGuards(KeycloakAuthGuard)
export class TagsController {
  constructor(private readonly tags: TagsService) {}

  @Get()
  @ApiOperation({ summary: 'Tag autocomplete by slug/display-name prefix.' })
  @ApiQuery({ name: 'q', required: true })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOkResponse({ type: TagDto, isArray: true })
  autocomplete(
    @Query('q') q: string,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ): Promise<TagDto[]> {
    return this.tags.autocomplete(q, limit);
  }

  @Get('popular')
  @ApiOperation({
    summary: 'Most-used tags overall, ranked by denormalised usage count.',
    description:
      'Cached server-side for ~10 minutes; usage counts are batched by the search-index worker.',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Max 50, default 24.' })
  @ApiOkResponse({ type: TagDto, isArray: true })
  popular(
    @Query('limit', new DefaultValuePipe(24), ParseIntPipe) limit: number,
  ): Promise<TagDto[]> {
    return this.tags.popular(limit);
  }
}
