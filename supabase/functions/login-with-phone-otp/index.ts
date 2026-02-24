import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const jsonResponse = (payload: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

const KECCEL_REQUEST_TIMEOUT_MS = 8000

const normalizePhone = (value: string): string => {
  const raw = (value || '').trim()
  if (!raw) return ''

  const hasPlus = raw.startsWith('+')
  const digitsOnly = raw.replace(/\D/g, '')
  if (!digitsOnly) return ''

  if (hasPlus) return `+${digitsOnly}`
  if (digitsOnly.startsWith('0')) return `+243${digitsOnly.slice(1)}`
  if (digitsOnly.startsWith('243')) return `+${digitsOnly}`
  if (digitsOnly.length >= 9 && digitsOnly.length <= 10) return `+243${digitsOnly}`
  return `+${digitsOnly}`
}

const isKeccelOtpValid = (payload: any): boolean => {
  return (
    payload?.statusOTP === 'VALID' ||
    payload?.status === 'VALID' ||
    payload?.status === 'True' ||
    payload?.status === true ||
    payload?.code === 200
  )
}

type KeccelValidationResult = {
  ok: boolean
  valid: boolean
  payload: any
  error?: string
}

const parseKeccelPayload = (rawText: string): any => {
  try {
    return JSON.parse(rawText)
  } catch {
    return { raw: rawText }
  }
}

const validateOtpWithKeccel = async (args: {
  token: string
  from: string
  to: string
  otp: string
}): Promise<KeccelValidationResult> => {
  const requestBody = JSON.stringify({
    token: args.token,
    from: args.from,
    to: args.to,
    otp: args.otp,
  })

  // Primary path over HTTPS; fallback to HTTP if provider resets TLS connection from Edge runtime.
  const endpoints = [
    'https://api.keccel.com/otp/validate.asp',
    'http://api.keccel.com/otp/validate.asp',
  ]

  let lastNetworkError = ''
  for (const endpoint of endpoints) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), KECCEL_REQUEST_TIMEOUT_MS)

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: requestBody,
        signal: controller.signal,
      })

      const rawText = await res.text()
      const payload = parseKeccelPayload(rawText)

      if (!res.ok) {
        return {
          ok: false,
          valid: false,
          payload,
          error:
            payload?.description ||
            payload?.message ||
            payload?.error ||
            `Provider OTP HTTP ${res.status}`,
        }
      }

      return {
        ok: true,
        valid: isKeccelOtpValid(payload),
        payload,
      }
    } catch (error: any) {
      const isTimeout = error?.name === 'AbortError'
      lastNetworkError = isTimeout
        ? `Timeout provider OTP (${KECCEL_REQUEST_TIMEOUT_MS}ms)`
        : String(error?.message || error || '')
    } finally {
      clearTimeout(timeoutId)
    }
  }

  return {
    ok: false,
    valid: false,
    payload: {},
    error: lastNetworkError || 'Echec de connexion au service OTP',
  }
}

const buildFallbackEmailFromPhone = (phone: string): string => {
  const digits = phone.replace(/\D/g, '')
  const phoneHash = digits.slice(-8)
  return `jonathantshombe+${phoneHash}@gmail.com`
}

const resolveUserByPhone = async (adminClient: any, normalizedPhone: string, rawPhone: string) => {
  // 1) Primary path via existing RPC helper.
  const { data: emailData } = await adminClient.rpc('get_user_email_by_phone', {
    p_phone: normalizedPhone,
  })

  if (emailData && emailData.length > 0 && emailData[0]?.user_id) {
    return {
      userId: emailData[0].user_id as string,
      email: (emailData[0].email as string) || buildFallbackEmailFromPhone(normalizedPhone),
    }
  }

  // 2) Fallback by profiles table with phone variants.
  const variants = Array.from(
    new Set([
      normalizedPhone,
      normalizedPhone.replace('+', ''),
      rawPhone,
      rawPhone.replace('+', ''),
      rawPhone.replace(/\D/g, ''),
    ].filter(Boolean))
  )

  let profileId: string | null = null
  for (const candidate of variants) {
    const { data: profile } = await adminClient
      .from('profiles')
      .select('id')
      .eq('phone', candidate)
      .maybeSingle()

    if (profile?.id) {
      profileId = profile.id as string
      break
    }
  }

  if (!profileId) return null

  const { data: userById } = await adminClient.auth.admin.getUserById(profileId)
  const userEmail = userById?.user?.email || buildFallbackEmailFromPhone(normalizedPhone)

  return {
    userId: profileId,
    email: userEmail,
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const publicAuthKey = anonKey || serviceRoleKey
    const keccelToken = Deno.env.get('KECCEL_API_TOKEN') ?? 'F42KARA4ES95FWH'
    const keccelFrom = Deno.env.get('KECCEL_FROM_NAME') ?? 'BISOTECH'

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({
        success: false,
        error: 'Configuration Supabase manquante',
      })
    }

    const { phone, otp } = await req.json()
    const rawPhone = String(phone || '')
    const normalizedPhone = normalizePhone(rawPhone)
    const otpCode = String(otp || '').replace(/\D/g, '').slice(0, 6)

    if (!normalizedPhone || otpCode.length !== 6) {
      return jsonResponse({
        success: false,
        error: 'Format du numéro ou du code OTP invalide',
      })
    }

    const keccelValidation = await validateOtpWithKeccel({
      token: keccelToken,
      from: keccelFrom,
      to: normalizedPhone,
      otp: otpCode,
    })
    const keccelPayload = keccelValidation.payload

    if (!keccelValidation.ok) {
      return jsonResponse({
        success: false,
        error:
          keccelValidation.error ||
          'Service OTP temporairement indisponible. Veuillez reessayer.',
      })
    }

    if (!keccelValidation.valid) {
      const message =
        keccelPayload?.description ||
        keccelPayload?.message ||
        keccelPayload?.error ||
        'Code OTP invalide ou expire'

      return jsonResponse({
        success: false,
        error: message,
      })
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
    const authClient = createClient(supabaseUrl, publicAuthKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    const resolvedUser = await resolveUserByPhone(adminClient, normalizedPhone, rawPhone)
    if (!resolvedUser?.userId || !resolvedUser?.email) {
      return jsonResponse({
        success: false,
        error: 'Aucun compte trouve avec ce numero de telephone',
      })
    }

    const userId = resolvedUser.userId
    const userEmail = resolvedUser.email

    // Use the validated OTP as temporary password so the user can change it in app settings.
    const temporaryPassword = otpCode

    const { error: updateError } = await adminClient.auth.admin.updateUserById(userId, {
      password: temporaryPassword,
      email_confirm: true,
    })

    if (updateError) {
      return jsonResponse({
        success: false,
        error: updateError.message || 'Impossible de preparer la connexion OTP',
      })
    }

    const { data: authData, error: signInError } = await authClient.auth.signInWithPassword({
      email: userEmail,
      password: temporaryPassword,
    })

    if (signInError || !authData?.session || !authData?.user) {
      return jsonResponse({
        success: false,
        error: signInError?.message || 'Connexion OTP impossible',
      })
    }

    return jsonResponse({
      success: true,
      message: 'Connexion OTP reussie',
      notice:
        'Apres la connexion, modifiez votre mot de passe dans Parametres (utilisez ce code OTP comme mot de passe actuel).',
      session: {
        access_token: authData.session.access_token,
        refresh_token: authData.session.refresh_token,
        expires_in: authData.session.expires_in,
      },
      user: {
        id: authData.user.id,
        email: authData.user.email,
        user_metadata: authData.user.user_metadata,
      },
    })
  } catch (error: any) {
    return jsonResponse({
      success: false,
      error: error?.message || 'Erreur interne du service OTP',
    })
  }
})
