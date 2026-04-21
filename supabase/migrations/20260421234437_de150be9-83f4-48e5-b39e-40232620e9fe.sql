CREATE POLICY "Managers read all bindings"
ON public.messaging_chat_bindings FOR SELECT
USING (has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "Managers delete all bindings"
ON public.messaging_chat_bindings FOR DELETE
USING (has_role(auth.uid(), 'manager'::app_role));