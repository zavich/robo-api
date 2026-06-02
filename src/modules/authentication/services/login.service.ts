import { BadRequestException, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { compare } from 'bcryptjs';
import { User } from 'src/modules/user/schema/user.schema';
import { AuthDto } from '../dto/auth.dto';

@Injectable()
export class LoginService {
  constructor(
    @InjectModel(User.name)
    private userModel: Model<User>,
    private readonly jwtService: JwtService,
  ) {}

  async execute(data: AuthDto) {
    const email = data.email.trim().toLowerCase();
    const user = await this.userModel.findOne({ email });

    if (!user) {
      throw new BadRequestException('Usuário não encontrado!');
    }

    const passwordMatch = await compare(data.password, user?.password || '');
    if (!passwordMatch) {
      throw new BadRequestException('E-mail ou senha inválidos');
    }

    // Payload no formato do contrato de SSO (ver jwt.constants / handoff).
    // `algorithm`, `issuer` e `expiresIn` vêm do JwtModule (assinatura RS256).
    const accessToken = this.jwtService.sign({
      user: {
        email: user.email,
        nome: user.name,
        sobreNome: '', // robo-api não modela sobrenome; mantido por consistência
        cargo: user.role,
        permissoes: [], // robo-api autoriza por `role`, não por lista de permissões
      },
      sub: String(user._id),
    });

    return {
      accessToken,
      user: {
        email: user.email,
        _id: user._id,
      },
    };
  }
}
