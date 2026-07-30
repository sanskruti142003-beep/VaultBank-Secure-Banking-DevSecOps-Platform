import { InternalServerErrorException } from '@nestjs/common';
import nodemailer from 'nodemailer';
import { NotificationMailerService } from './notification-mailer.service';

jest.mock('nodemailer', () => ({
  __esModule: true,
  default: {
    createTransport: jest.fn(),
  },
}));

describe('NotificationMailerService', () => {
  const originalEnv = { ...process.env };

  let createTransportMock: jest.Mock;
  let sendMail: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };

    delete process.env.SMTP_HOST;
    delete process.env.SMTP_PORT;
    delete process.env.SMTP_SECURE;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_FROM;
    delete process.env.SMTP_PASS;
    delete process.env.GOOGLE_APP_PASSWORD;
    delete process.env.GMAIL_APP_PASSWORD;

    createTransportMock = nodemailer.createTransport as unknown as jest.Mock;
    sendMail = jest.fn().mockResolvedValue({
      accepted: ['customer@example.test'],
    });

    createTransportMock.mockReturnValue({
      sendMail,
    });
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('sends mail using secure default SMTP settings and caches the transporter', async () => {
    process.env.SMTP_USER = 'mailer@example.test';
    process.env.SMTP_PASS = 'unit-test-password';

    const service = new NotificationMailerService();

    const message = {
      to: 'customer@example.test',
      subject: 'VaultBank notification',
      text: 'Plain text notification',
      html: '<p>HTML notification</p>',
    };

    await service.send(message);
    await service.send(message);

    expect(createTransportMock).toHaveBeenCalledTimes(1);
    expect(createTransportMock).toHaveBeenCalledWith({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        user: 'mailer@example.test',
        pass: 'unit-test-password',
      },
    });

    expect(sendMail).toHaveBeenCalledTimes(2);
    expect(sendMail).toHaveBeenCalledWith({
      from: '"VaultBank" <mailer@example.test>',
      to: 'customer@example.test',
      subject: 'VaultBank notification',
      text: 'Plain text notification',
      html: '<p>HTML notification</p>',
    });
  });

  it('uses custom host, port, sender and explicit non-secure configuration', async () => {
    process.env.SMTP_HOST = 'smtp.internal.example.test';
    process.env.SMTP_PORT = '587';
    process.env.SMTP_SECURE = 'no';
    process.env.SMTP_USER = 'smtp-user@example.test';
    process.env.SMTP_FROM = 'notifications@example.test';
    process.env.SMTP_PASS = 'unit-test-password';

    const service = new NotificationMailerService();

    await service.send({
      to: 'customer@example.test',
      subject: 'Custom SMTP',
      text: 'Test message',
      html: '<p>Test message</p>',
    });

    expect(createTransportMock).toHaveBeenCalledWith({
      host: 'smtp.internal.example.test',
      port: 587,
      secure: false,
      auth: {
        user: 'smtp-user@example.test',
        pass: 'unit-test-password',
      },
    });

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: '"VaultBank" <notifications@example.test>',
      }),
    );
  });

  it('accepts GOOGLE_APP_PASSWORD as a password fallback', async () => {
    process.env.SMTP_USER = 'mailer@example.test';
    process.env.GOOGLE_APP_PASSWORD = 'google-unit-test-password';

    const service = new NotificationMailerService();

    await service.send({
      to: 'customer@example.test',
      subject: 'Password fallback',
      text: 'Test',
      html: '<p>Test</p>',
    });

    expect(createTransportMock).toHaveBeenCalledWith(
      expect.objectContaining({
        auth: {
          user: 'mailer@example.test',
          pass: 'google-unit-test-password',
        },
      }),
    );
  });

  it('rejects mail delivery when SMTP_USER is missing', async () => {
    process.env.SMTP_PASS = 'unit-test-password';

    const service = new NotificationMailerService();

    await expect(
      service.send({
        to: 'customer@example.test',
        subject: 'Missing user',
        text: 'Test',
        html: '<p>Test</p>',
      }),
    ).rejects.toThrow(
      new InternalServerErrorException('SMTP_USER is not configured'),
    );

    expect(createTransportMock).not.toHaveBeenCalled();
  });

  it('rejects mail delivery when an SMTP password is missing', async () => {
    process.env.SMTP_USER = 'mailer@example.test';

    const service = new NotificationMailerService();

    await expect(
      service.send({
        to: 'customer@example.test',
        subject: 'Missing password',
        text: 'Test',
        html: '<p>Test</p>',
      }),
    ).rejects.toThrow(
      new InternalServerErrorException('SMTP_PASS is not configured'),
    );
  });

  it('rejects an invalid SMTP port', async () => {
    process.env.SMTP_USER = 'mailer@example.test';
    process.env.SMTP_PASS = 'unit-test-password';
    process.env.SMTP_PORT = 'invalid-port';

    const service = new NotificationMailerService();

    await expect(
      service.send({
        to: 'customer@example.test',
        subject: 'Invalid port',
        text: 'Test',
        html: '<p>Test</p>',
      }),
    ).rejects.toThrow(new InternalServerErrorException('SMTP_PORT is invalid'));

    expect(createTransportMock).not.toHaveBeenCalled();
  });
});
