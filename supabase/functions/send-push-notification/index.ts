// Supabase Edge Function pour envoyer des push notifications via Expo Push Notification Service
// Utilise expo-server-sdk pour envoyer les notifications

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Expo } from 'https://esm.sh/expo-server-sdk@3.7.0'

const expo = new Expo()

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Gérer les requêtes OPTIONS pour CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Créer le client Supabase avec le token d'authentification
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Récupérer le token d'authentification de la requête
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Parser le body de la requête
    const { userId, title, body, data, sound = 'default' } = await req.json()

    if (!userId || !title || !body) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: userId, title, body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Récupérer tous les tokens push de l'utilisateur
    const { data: tokens, error: tokensError } = await supabaseClient
      .from('push_tokens')
      .select('token, platform')
      .eq('user_id', userId)

    if (tokensError) {
      console.error('Error fetching push tokens:', tokensError)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch push tokens', details: tokensError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!tokens || tokens.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'No push tokens found for this user',
          sent: 0 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Préparer les messages pour Expo
    const messages = tokens
      .filter(token => Expo.isExpoPushToken(token.token))
      .map(token => ({
        to: token.token,
        sound: sound,
        title: title,
        body: body,
        data: data || {},
        badge: 1, // Optionnel : nombre de notifications non lues
      }))

    if (messages.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'No valid Expo push tokens found',
          sent: 0 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Envoyer les notifications par chunks (Expo limite à 100 messages par requête)
    const chunks = expo.chunkPushNotifications(messages)
    const tickets = []

    for (const chunk of chunks) {
      try {
        const ticketChunk = await expo.sendPushNotificationsAsync(chunk)
        tickets.push(...ticketChunk)
      } catch (error) {
        console.error('Error sending push notification chunk:', error)
        // Continuer avec les autres chunks même si un échoue
      }
    }

    // Compter les notifications envoyées avec succès
    const sentCount = tickets.filter(ticket => ticket.status === 'ok').length
    const failedCount = tickets.filter(ticket => ticket.status === 'error').length

    return new Response(
      JSON.stringify({
        success: true,
        message: `Sent ${sentCount} notification(s), ${failedCount} failed`,
        sent: sentCount,
        failed: failedCount,
        totalTokens: tokens.length,
        tickets: tickets
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Error in send-push-notification function:', error)
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error', 
        details: error.message 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})



