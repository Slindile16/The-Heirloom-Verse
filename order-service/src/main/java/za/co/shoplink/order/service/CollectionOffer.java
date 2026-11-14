package za.co.shoplink.order.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import za.co.shoplink.common.catalogue.JewelleryCatalogue;
import za.co.shoplink.order.dto.CreateOrderRequest.Selection;
import za.co.shoplink.order.model.OrderItem;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.*;

/** Reconstructs selected designs before pricing; set components never unlock the offer. */
public final class CollectionOffer {
    private static final Map<String, JsonNode> DESIGNS = load();
    private CollectionOffer() {}

    private static Map<String, JsonNode> load() {
        try (var input = JewelleryCatalogue.class.getResourceAsStream("/shoplink/catalogue.json")) {
            if (input == null) throw new IllegalStateException("Missing catalogue");
            Map<String, JsonNode> designs = new HashMap<>();
            for (JsonNode design : new ObjectMapper().readTree(input)) designs.put(design.path("id").asText(), design);
            return Map.copyOf(designs);
        } catch (java.io.IOException e) { throw new IllegalStateException("Cannot load promotion catalogue", e); }
    }

    private static ResponseStatusException invalid() {
        return new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "Selected designs do not match the order items");
    }

    public static List<OrderItem> apply(List<OrderItem> items, List<Selection> selections) {
        // Legacy direct API orders retain standard pricing; the storefront always supplies selections.
        if (selections == null) return items;
        if (selections.isEmpty() || selections.size() > 80) throw invalid();
        Map<String, Integer> expected = new HashMap<>(), actual = new HashMap<>(), eligible = new HashMap<>();
        Set<String> eligibleDesigns = new HashSet<>();
        try {
            for (Selection selection : selections) {
                if (selection == null || selection.quantity() < 1 || selection.quantity() > 10) throw invalid();
                JsonNode design = DESIGNS.get(selection.id());
                if (design == null || design.path("hidden").asBoolean() || selection.option() == null) throw invalid();
                List<JsonNode> pieces = new ArrayList<>();
                if (design.path("components").isArray() && !design.path("components").isEmpty()) {
                    for (JsonNode component : design.path("components")) pieces.add(DESIGNS.get(component.path("productId").asText()));
                } else pieces.add(design);
                String[] options = selection.option().split("\\|", -1);
                if (options.length != pieces.size()) throw invalid();
                boolean qualifies = pieces.size() == 1 && !design.has("components") && design.path("collectionOffer").asBoolean();
                for (int i = 0; i < pieces.size(); i++) {
                    JsonNode piece = pieces.get(i);
                    if (piece == null || piece.has("components")) throw invalid();
                    boolean valid = false;
                    for (JsonNode option : piece.path("options")) if (option.asText().equals(options[i])) valid = true;
                    if (!valid) throw invalid();
                    String variant = piece.path("sku").asText() + "-" + options[i];
                    expected.merge(variant, selection.quantity(), Math::addExact);
                    if (qualifies) eligible.merge(variant, selection.quantity(), Math::addExact);
                }
                if (qualifies) eligibleDesigns.add(selection.id());
            }
            for (OrderItem item : items) actual.merge(item.productId(), item.quantity(), Math::addExact);
        } catch (ArithmeticException e) { throw invalid(); }
        if (!expected.equals(actual)) throw invalid();
        if (eligibleDesigns.size() < 2) return items;
        List<OrderItem> priced = new ArrayList<>();
        for (OrderItem item : items) {
            int discounted = Math.min(item.quantity(), eligible.getOrDefault(item.productId(), 0));
            if (discounted > 0) {
                BigDecimal saving = item.unitPrice().multiply(new BigDecimal("0.20")).setScale(2, RoundingMode.HALF_UP);
                priced.add(new OrderItem(item.productId(), item.productName(), discounted,
                        item.unitPrice().subtract(saving), item.currency(), item.unitPrice()));
                eligible.put(item.productId(), eligible.get(item.productId()) - discounted);
            }
            if (discounted < item.quantity()) priced.add(new OrderItem(item.productId(), item.productName(),
                    item.quantity() - discounted, item.unitPrice(), item.currency()));
        }
        return List.copyOf(priced);
    }
}
