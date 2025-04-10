import { Inject, Provide } from '@midwayjs/core';
import { PrismaService } from '@/providers/prisma';
import { JwtService } from '@midwayjs/jwt';
import { PasswordService } from '@/service/password.service';
import { v4 as uuidv4 } from 'uuid';

@Provide()
export class AdminService {
  @Inject()
  jwt: JwtService;

  async login(email: string, password: string) {
    const user = await PrismaService.user.findFirst({
      where: {
        email: email,
      },
    });

    if (
      user &&
      (await PasswordService.comparePassword(password, user.password))
    ) {
      const tokenPayload = { userId: user.uid, email: user.email };

      const generateJwt = await this.jwt.sign(tokenPayload, {
        expiresIn: '4h',
        audience: 'admin',
      });
      const generateLongJwt = await this.jwt.sign(
        tokenPayload,
        process.env.JWT_PRIVATE_KEY,
        {
          expiresIn: '7d',
          audience: 'admin',
        }
      );
      return {
        ...user,
        token: generateJwt,
        longToken: generateLongJwt,
      };
    } else {
      throw new Error('Invalid username or password');
    }
  }

  async register(
    email: string,
    password: string,
    nickname: string,
    authcode: string
  ) {
    if (!authcode || process.env.REGISTER_AUTH_CODE !== authcode) {
      throw new Error('Invalid authcode or not allow user');
    }

    const hashedPassword = await PasswordService.hashPassword(password);

    return await PrismaService.user.create({
      data: {
        email: email,
        nickname: nickname,
        uid: uuidv4(),
        password: hashedPassword,
        role: 1,
      },
    });
  }
}
