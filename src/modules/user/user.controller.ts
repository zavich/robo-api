import { Body, Controller, Get, Param, Patch, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { ApiKeyAuthGuard } from '../authentication/guards/apikey-auth.guard';
import { CheckPermissions } from '../authentication/decorators/check-permissions.decorator';
import { UpdateUserSchemaBody, updateUserSchemaPipe } from './dto/update.dto';
import { UpdateUserService } from './services/update.service';
import { ListUserService } from './services/list.service';

@Controller('users')
@ApiBearerAuth()
@UseGuards(ApiKeyAuthGuard)
export class UsersController {
  constructor(
    private readonly updateUserService: UpdateUserService,
    private readonly listUserService: ListUserService,
  ) {}

  @Get('')
  @CheckPermissions('user_management')
  async listAllUsers() {
    return await this.listUserService.execute();
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body(updateUserSchemaPipe) body: UpdateUserSchemaBody,
    @Req() req: Request,
  ) {
    const requester = req.user;
    return await this.updateUserService.execute(id, body, requester);
  }
}
