import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { FlexibleAuthGuard } from '../../infra/keycloak/flexible-auth.guard';
import { GifProvider, GifsService } from './gifs.service';

@ApiTags('Gifs')
@ApiBearerAuth('keycloak')
@Controller('gifs')
@UseGuards(FlexibleAuthGuard)
export class GifsController {
  constructor(private readonly gifs: GifsService) {}

  @Get('search')
  @ApiOperation({ summary: 'Proxy GIF search (Tenor/Giphy) for the comment composer.' })
  @ApiQuery({ name: 'q', required: false })
  @ApiQuery({ name: 'provider', required: false, enum: ['tenor', 'giphy'] })
  @ApiQuery({ name: 'limit', required: false })
  @ApiOkResponse()
  search(
    @Query('q') q?: string,
    @Query('provider') provider?: GifProvider,
    @Query('limit') limit?: string,
  ) {
    const n = Math.min(Math.max(Number(limit ?? 24), 1), 50);
    return this.gifs.search((q ?? '').trim(), provider, n);
  }
}
