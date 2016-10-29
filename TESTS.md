TESTS.MD

1. Subscription verification:
	a. Req1: required: hub.callback,hub.topic,hub.mode
		optional: hub.lease_seconds,hub.secret,hub.startFrom
	b. Callback GET request received with original req object urlEncoded in params and with hub.challenge extra
	c. Status code 2XX leads to verified:true if challenge is sent back, otherwise fails and gives failure_rationale
