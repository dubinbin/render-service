import { Body, Context, Controller, Get, Inject, Post } from '@midwayjs/core';
import { AdminService } from '@/service/auth.service';
import { JwtPassportMiddleWare } from '@/middleware/jwt.middleware';
import { JwtService } from '@midwayjs/jwt';
import { StateUser } from '@/types';

@Controller('/auth')
export class APIController {
  @Inject()
  ctx: Context;

  @Inject()
  jwt: JwtService;

  @Inject()
  adminService: AdminService;

  @Post('/login')
  async login(
    @Body('email') email: string,
    @Body('password') password: string
  ) {
    try {
      const user = await this.adminService.login(email, password);
      const userResult = {
        access_token: user.token,
        refresh_token: user.longToken,
        uid: user.uid,
        nickname: user.nickname,
        email: user.email,
      };
      return { success: true, message: 'OK', data: userResult };
    } catch (e) {
      this.ctx.logger.info(e);
      return {
        success: false,
        message: 'invalid eamil or invalid password',
        data: undefined,
      };
    }
  }

  @Post('/register')
  async register(
    @Body('email') email: string,
    @Body('password') password: string,
    @Body('nickname') nickname: string,
    @Body('authcode') authcode: string
  ) {
    try {
      const userPsw = password;
      const user = await this.adminService.register(
        email,
        password,
        nickname,
        authcode
      );

      if (user.id && user.email) {
        const getUserResult = await this.adminService.login(
          user.email,
          userPsw
        );
        const userResult = {
          access_token: getUserResult.token,
          refresh_token: getUserResult.longToken,
          uid: getUserResult.uid,
          nickname: user.nickname,
          email: getUserResult.email,
        };
        return { success: true, message: 'OK', data: userResult };
      } else {
        return {
          success: false,
          message: 'invalid eamil or invalid password',
          data: undefined,
        };
      }
    } catch (e) {
      return {
        success: false,
        message: 'invalid eamil or invalid password',
        data: undefined,
      };
    }
  }

  @Get('/refreshToken', { middleware: [JwtPassportMiddleWare] })
  async refreshToken() {
    try {
      const user = (this.ctx as any).state.user as StateUser;
      if (!user) {
        // long token过期了只能登陆了
        return {
          success: false,
          message: 'refresh token已失效',
        };
      }
      const tokenPayload = { userId: user.userId, email: user.email };
      const generateJwt = await this.jwt.sign(tokenPayload, {
        expiresIn: '24h',
      });
      const generateLongJwt = await this.jwt.sign(tokenPayload, {
        expiresIn: '7d',
      });
      return {
        success: true,
        data: {
          ...user,
          access_token: generateJwt,
          refresh_token: generateLongJwt,
        },
        message: '获取成功',
      };
    } catch (e) {
      this.ctx.logger.info(e);
    }
  }

  @Get('/user/info', { middleware: [JwtPassportMiddleWare] })
  async getUserInfo() {
    try {
      // 添加日志以检查用户信息
      const user = (this.ctx as any).state.user as StateUser;
      if (!user || !user.userId || !user.email) {
        throw new Error('fail to get user info');
      }
      return {
        success: true,
        data: user,
        message: '获取成功',
      }; // 如果需要返回用户信息
    } catch (e) {
      this.ctx.logger.info(e);
      return {
        success: false,
        data: null,
        message: 'fail to get user info',
      };
    }
  }
}
