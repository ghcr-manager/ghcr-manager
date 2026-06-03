# 07 Task: Cosign and more

## Status

I think by now our logic works for our "graph" scenario - except cosign.

And for cosign - let's take our simplest graph scenario with them `1image-cosign--delete-image-a` - our current logic
alone does not work. I think it does not work because cosign adds extra index-manifest which point TO things we evaluate
for deletion and not FROM the latter.

But looking a bit further I can come up with similar scenarios without cosign.

For example, if we make a copy of our `2multiarch-base--delete-image-a-and-multiarch-a` scenario of and remove all tags
except `image-a` and `multiarch-a` while keeping all manifests. Then we run our cleanup logic and delete the tag
`multiarch-a`. Then where do we stop deleting? One can argue very well that then now all manifests except `image-a` must
be removed as chain without tags from manifest with `multiarch-a` on, even though that means following references
against their direction.

I am not fully sure yet, but I lean towards having a second `manifest_reachability` table where we follow the graph in
any direction up to either the source manifest or something with a (non-sha) tag. And once we know what manifests to
delete we do something like now find their closure and from then on find anything that is in any way linked to the
closure but not in the closure of a tag. I am not sure if we then would again delete too much - the extra cosign
manifests for example in some cases.

And of course what I described above can also be done with recursive CTE - I don't expect such chains to be very large
and if someone has that in his registry then he has other problems to worry about then long duration of our tool.

What do you think? As I said, I have a vague idea but also doubt that it's waterproof. Do you see other solutions?
