export type Channel="chat"|"email";
export type ConversationStatus="open"|"snoozed"|"resolved";
export type SenderType="contact"|"agent"|"system";
export type Workspace={id:string;name:string;slug:string;public_key:string};
export type Membership={id:string;workspace_id:string;user_id:string;role:"admin"|"agent"};
export type Contact={id:string;name:string|null;email:string|null;visitor_key:string|null;last_seen_at:string|null};
export type Conversation={id:string;workspace_id:string;contact_id:string;channel:Channel;subject:string|null;status:ConversationStatus;assignee_id:string|null;last_message_at:string;created_at:string;contact?:Contact;unread_count?:number};
export type Message={id:string;workspace_id:string;conversation_id:string;sender_type:SenderType;sender_membership_id:string|null;channel:Channel;body:string;read_at:string|null;created_at:string};
