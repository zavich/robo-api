import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { ApiKeyAuthGuard } from '../authentication/guards/apikey-auth.guard';
import { ListNotificationsService } from './services/list.service';
import { ReadNotificationService } from './services/read.service';
import { DeleteNotificationsService } from './services/delete.service';

@Controller('notifications')
@ApiBearerAuth()
@UseGuards(ApiKeyAuthGuard)
export class NotificationsController {
  constructor(
    private readonly listNotificationService: ListNotificationsService,
    private readonly readNotificationService: ReadNotificationService,
    private readonly deleteNotificationsService: DeleteNotificationsService,
  ) {}

  // ✅ Listar notificações do usuário logado
  @Get('me')
  async listMyNotifications(
    @Req() req,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const userId = req.user.id;

    return await this.listNotificationService.execute(userId, {
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }
  @Patch(':id/read')
  async markAsRead(@Param('id') id: string, @Req() req) {
    const userId = req.user.id; // obtém o usuário logado
    console.log('userId', userId);

    return await this.readNotificationService.execute(id, userId);
  }
  @Delete()
  async deleteManyNotifications(@Body('ids') ids: string[], @Req() req) {
    const userId = req.user.id;
    return this.deleteNotificationsService.execute(ids, userId);
  }
}
