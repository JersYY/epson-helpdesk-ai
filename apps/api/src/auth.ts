import type { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'

import { env } from './env.js'
import type { AuthUser } from './types.js'

export interface AuthedRequest extends Request {
  user: AuthUser
}

export function signToken(user: AuthUser) {
  return jwt.sign(user, env.JWT_SECRET, {
    expiresIn: '12h',
  })
}

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const header = req.headers.authorization

  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ message: 'Unauthorized' })
    return
  }

  const token = header.slice('Bearer '.length)

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as AuthUser
    ;(req as AuthedRequest).user = payload
    next()
  } catch {
    res.status(401).json({ message: 'Session tidak valid. Silakan login ulang.' })
  }
}
